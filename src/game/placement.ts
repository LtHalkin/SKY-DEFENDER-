import { ASSET_TYPES, BATTERY_TYPES, GROUND_RADARS, RADAR_SITES, RADAR_SITE_MAP, SAM_SITES, SITE_MAP } from '../sim/data/aircraftTypes'
import { RADAR_DEFS } from '../sim/data/radars'
import { AIRPORT_MAP } from '../sim/data/airports'
import { distNm } from '../sim/geo'
import type { Save } from './save'

// How exposed each base is to raids (they come mostly from the north and east, over the sea).
const FIGHTER_BASES: Record<string, number> = { EGQL: 1.35, EGQS: 1.3, EGXE: 1.25, EGXC: 1.1, EGAA: 0.85, EGXW: 0.85, EGUN: 0.8, EGVN: 0.55, EGDL: 0.45, EGVO: 0.45 }
const TANKER_BASES: Record<string, number> = { EGVN: 1, EGUN: 0.95, EGXW: 0.85, EGQL: 0.7 }
const AEW_BASES: Record<string, number> = { EGXW: 1, EGQS: 0.9, EGAA: 0.7 }
const HELO_BASES: Record<string, number> = { EGVO: 1, EGAA: 0.9 }
const TRANSPORT_BASES: Record<string, number> = { EGDL: 1, EGVN: 0.8 }
// Value of protecting each SAM site (matches the raid target values).
const SITE_VALUE: Record<string, number> = { LONDON: 30, EDINBURGH: 25, MANCHESTER: 25, NEWCASTLE: 20, ABERDEEN: 20, BELFAST: 20, LEEMING: 20, LEUCHARS: 20, CONINGSBY: 20, LOSSIEMOUTH: 20, BIRMINGHAM: 14, GLASGOW: 14, NORWICH: 12, BRISTOL: 10 }

const pos = (icao: string) => AIRPORT_MAP[icao]
function basesFor(typeId: string) {
  const role = ASSET_TYPES[typeId]?.role
  return role === 'FIGHTER' ? FIGHTER_BASES : role === 'TANKER' ? TANKER_BASES : role === 'AEW' || role === 'ELINT' ? AEW_BASES : role === 'HELO' ? HELO_BASES : TRANSPORT_BASES
}
/** Best base for a new aircraft: most exposed base with the least of that role on or near it. */
export function bestBase(save: Pick<Save, 'fleet'>, typeId: string, exclude?: string): string {
  const role = ASSET_TYPES[typeId].role, cands = basesFor(typeId)
  const same = save.fleet.filter((f) => f.id !== exclude && ASSET_TYPES[f.typeId]?.role === role)
  let best = Object.keys(cands)[0], bs = -Infinity
  for (const [icao, w] of Object.entries(cands)) {
    const here = same.filter((f) => f.base === icao).length
    const near = same.filter((f) => f.base !== icao && distNm(pos(f.base), pos(icao)) < 110).length
    const sc = w / (1 + here + 0.5 * near)
    if (sc > bs) { bs = sc; best = icao }
  }
  return best
}
/** Best site for a new SAM battery: most valuable target not already inside another battery's range. */
export function bestSamSite(save: Pick<Save, 'batteries'>, typeId: string, exclude?: string): string {
  const mine = save.batteries.filter((b) => b.id !== exclude)
  const t = BATTERY_TYPES[typeId]
  let best = 'LONDON', bs = -Infinity
  for (const s of SAM_SITES) {
    const covering = mine.filter((b) => { const bt = BATTERY_TYPES[b.typeId]; return bt && distNm(SITE_MAP[b.site], s) <= bt.range }).length
    // long-range batteries also earn credit for neighbouring targets they would cover
    const extra = SAM_SITES.filter((o) => o.id !== s.id && distNm(o, s) <= t.range).reduce((a, o) => a + (SITE_VALUE[o.id] ?? 10) * 0.4 / (1 + mine.filter((b) => distNm(SITE_MAP[b.site], o) <= BATTERY_TYPES[b.typeId].range).length), 0)
    const sc = ((SITE_VALUE[s.id] ?? 10) + extra) / (1 + covering * 1.5)
    if (sc > bs) { bs = sc; best = s.id }
  }
  return best
}
// Sample points over the sea approaches and coast where coverage matters.
const GRID: { lat: number; lon: number }[] = []
for (let lat = 49.5; lat <= 62; lat += 0.5) for (let lon = -12; lon <= 4; lon += 0.6) GRID.push({ lat, lon })
const cover = (r: { lat: number; lon: number; range: number; antennaFt: number }, p: { lat: number; lon: number }, tgtAlt: number) =>
  distNm(r, p) <= Math.min(r.range, 1.23 * (Math.sqrt(r.antennaFt) + Math.sqrt(tgtAlt)))
/** Best site for a new ground radar: the one that fills the biggest hole in existing cover. */
export function bestRadarSite(save: Pick<Save, 'radars'>, typeId: string, exclude?: string): string {
  const g = GROUND_RADARS[typeId]
  const alt = typeId === 'GAPFILLER' ? 500 : 8000 // gap-fillers are judged on low-level cover
  const existing = [
    ...RADAR_DEFS.map((d) => ({ lat: d.lat, lon: d.lon, range: d.primaryRange, antennaFt: d.antennaFt })),
    ...save.radars.filter((r) => r.id !== exclude).map((r) => ({ ...RADAR_SITE_MAP[r.site], range: GROUND_RADARS[r.typeId].range, antennaFt: GROUND_RADARS[r.typeId].antennaFt })),
  ]
  const holes = GRID.filter((p) => !existing.some((r) => cover(r, p, alt)))
  let best = RADAR_SITES[0].id, bs = -1
  for (const s of RADAR_SITES) {
    if (save.radars.some((r) => r.id !== exclude && r.site === s.id)) continue
    const sc = holes.filter((p) => cover({ ...s, range: g.range, antennaFt: g.antennaFt }, p, alt)).length
    if (sc > bs) { bs = sc; best = s.id }
  }
  return best
}
/** Re-spread everything already owned (strongest items placed first). */
export function autoArrange(save: Save) {
  const fleet = [...save.fleet].sort((a, b) => (ASSET_TYPES[b.typeId].maxKt * (ASSET_TYPES[b.typeId].missiles + 1)) - (ASSET_TYPES[a.typeId].maxKt * (ASSET_TYPES[a.typeId].missiles + 1)))
  const placed: Save['fleet'] = []
  for (const f of fleet) { f.base = bestBase({ fleet: placed }, f.typeId); placed.push(f) }
  const bats = [...save.batteries].sort((a, b) => BATTERY_TYPES[b.typeId].range - BATTERY_TYPES[a.typeId].range)
  const pb: Save['batteries'] = []
  for (const b of bats) { b.site = bestSamSite({ batteries: pb }, b.typeId); pb.push(b) }
  const rads = [...save.radars].sort((a, b) => GROUND_RADARS[b.typeId].range - GROUND_RADARS[a.typeId].range)
  const pr: Save['radars'] = []
  for (const r of rads) { r.site = bestRadarSite({ radars: pr }, r.typeId); pr.push(r) }
}

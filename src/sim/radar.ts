import { RADAR_DEFS } from './data/radars'
import { ASSET_TYPES, GROUND_RADARS, RADAR_SITE_MAP } from './data/aircraftTypes'
import { bearingDeg, distNm, norm360 } from './geo'
import { wxAttenuation } from './weather'
import type { Aircraft, GameState, Plot, Radar, Track } from './types'

export function makeRadars(st: GameState): Radar[] {
  const out: Radar[] = RADAR_DEFS.map((d) => ({
    ...d, status: st.cfg.radarOff.includes(d.id) ? 'OFFLINE' : 'OPERATIONAL', condition: st.rng.range(86, 100), interference: 0, angle: d.phase,
    hits: 0, lastHit: 0, repairUntil: 0, repairTeam: false, forcedOffline: st.cfg.radarOff.includes(d.id), note: st.cfg.radarOff.includes(d.id) ? 'Offline at start of watch' : 'Nominal',
  }))
  for (const x of st.cfg.extraRadars ?? []) {
    const t = GROUND_RADARS[x.typeId], site = RADAR_SITE_MAP[x.site]; if (!t || !site) continue
    out.push({ id: x.id, name: `${t.short} ${site.name}`, lat: site.lat, lon: site.lon, antennaFt: t.antennaFt, primaryRange: t.range, secondaryRange: t.range, sweepSec: t.sweepSec, phase: st.rng.range(0, 360), wxSens: 0.5, status: 'OPERATIONAL', condition: 98, interference: 0, angle: 0, hits: 0, lastHit: 0, repairUntil: 0, repairTeam: false, note: 'Player-owned' })
  }
  const boost = 1 + 0.1 * (st.cfg.upgrades?.radar ?? 0)
  for (const r of out) { r.primaryRange = Math.round(r.primaryRange * boost); r.secondaryRange = Math.round(r.secondaryRange * boost) }
  // airborne platforms: positions follow the assets
  for (const a of Object.values(st.assets)) if (a.typeId === 'E3D') out.push({
    id: 'AEW-' + a.tail, name: `E-3D ${a.tail}`, lat: 0, lon: 0, antennaFt: 29000, primaryRange: 230, secondaryRange: 250, sweepSec: 10, phase: 30 + out.length * 17, wxSens: 0.15,
    status: 'OFFLINE', condition: 95, interference: 0, airborne: a.id, angle: 0, hits: 0, lastHit: 0, repairUntil: 0, repairTeam: false, note: 'On ground',
  })
  return out
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function radarEffective(r: Radar): number {
  if (r.status === 'OFFLINE' || r.status === 'MAINTENANCE') return 0
  const cf = 0.6 + 0.4 * (r.condition / 100)
  return (r.status === 'DEGRADED' ? 0.55 : 1) * cf
}
const inArc = (a: number, from: number, to: number) => (from <= to ? a >= from && a < to : a >= from || a < to)

export function stepRadars(st: GameState, dt: number) {
  const act = Object.values(st.aircraft).filter((a) => a.phase !== 'LANDED' && a.phase !== 'REMOVED' && !(a.alt < 120 && a.gs < 50))
  for (const r of st.radars) {
    if (r.airborne) {
      const as = st.assets[r.airborne]
      const ac = as?.ac
      if (!ac || ac.alt < 12000 || as.status === 'LAUNCHING') { r.status = 'OFFLINE'; r.note = 'Not on station'; r.angle = (r.angle + (360 * dt) / r.sweepSec) % 360; continue }
      r.lat = ac.lat; r.lon = ac.lon; r.antennaFt = ac.alt
      if (r.status === 'OFFLINE') { r.status = 'OPERATIONAL'; r.note = 'On station' }
    }
    const from = r.angle
    r.angle = (r.angle + (360 * dt) / r.sweepSec) % 360
    const eff = radarEffective(r)
    if (eff <= 0) continue
    for (const ac of act) {
      if (r.airborne && st.assets[r.airborne]?.ac === ac) continue
      if (ac.kind === 'asset' && ac.xpdr.iff4 === false && false) continue
      const rough = Math.abs(ac.lat - r.lat) * 60
      if (rough > r.primaryRange * 1.1) continue
      const d = distNm(r, ac)
      if (d > r.primaryRange * 1.1 || d < 1.5) continue
      const brg = bearingDeg(r, ac)
      if (!inArc(brg, from, r.angle)) continue
      detect(st, r, ac, d, brg, eff)
    }
  }
}
function detect(st: GameState, r: Radar, ac: Aircraft, d: number, brg: number, eff: number) {
  const rng = st.rng
  const los = 1.23 * (Math.sqrt(Math.max(ac.alt, 0)) + Math.sqrt(r.airborne ? r.antennaFt : r.antennaFt))
  if (d > los) { return }
  let maxR = r.primaryRange * eff * Math.pow(Math.max(ac.rcs, 0.02), 0.25)
  if (r.mask && inArc(brg, r.mask.from, r.mask.to)) maxR *= r.mask.factor
  const att = wxAttenuation(st.weather, r, ac)
  let pPrim = d < maxR ? 0.97 * (1 - Math.pow(d / maxR, 4)) : 0
  pPrim *= 1 - r.wxSens * att * 0.85
  pPrim *= 1 - r.interference * 0.8
  if (r.airborne) pPrim = Math.min(1, pPrim * 1.1)
  // very low targets lose primary return to clutter near the radar horizon
  if (ac.alt < 600 && d > 40) pPrim *= 0.5
  const prim = rng.next() < pPrim
  let sec = false
  if (ac.xpdr.on && d < r.secondaryRange * eff) {
    const pSec = 0.96 * (1 - r.interference * 0.55) * (0.7 + 0.3 * eff) * (ac.alt < 300 ? 0.2 : 1)
    sec = rng.next() < pSec
  }
  if (!prim && !sec) return
  const sig = 0.04 + d * 0.0011
  const dLat = (rng.gauss() * sig) / 60, dLon = (rng.gauss() * sig) / 60 / Math.cos((ac.lat * Math.PI) / 180)
  const plot: Plot = { t: st.t, lat: ac.lat + dLat, lon: ac.lon + dLon, alt: sec && ac.xpdr.modeC ? Math.round(ac.alt / 100) * 100 : null, radar: r.id }
  r.hits++; r.lastHit = st.t
  updateTrack(st, ac, plot, sec)
}

export function updateTrack(st: GameState, ac: Aircraft, plot: Plot, sec: boolean) {
  const tid = st.trackByEntity[ac.id]
  let tr: Track | undefined = tid ? st.tracks[tid] : undefined
  if (!tr) {
    const num = ++st.trackNum
    tr = {
      id: 'T' + String(num).padStart(4, '0'), num, entityId: ac.id, created: st.t, lastPlot: st.t, lat: plot.lat, lon: plot.lon, alt: null, altEst: true,
      hdg: ac.hdg, gs: 0, vs: 0, plots: [], sources: [], quality: 1, coasting: false, dropped: false, squawk: null, ms: null, iff4: false, comint: null, esm: null,
      category: 'UNKNOWN', manual: null, autoPlanId: null, flags: [], checks: {}, unknownSince: st.t, lastSsr: -1e9, intelLinks: [], log: [], watch: false,
    }
    st.tracks[tr.id] = tr; st.trackByEntity[ac.id] = tr.id
    st.events.push({ type: 'newTrack', trackId: tr.id })
  } else if (tr.dropped) { tr.dropped = false; tr.log.push(`${st.t}|Track re-acquired`) }
  tr.lastPlot = st.t; tr.coasting = false
  const prevT = tr.plots.length ? tr.plots[tr.plots.length - 1].t : st.t
  // smoothing between near-simultaneous plots
  const a = st.t - prevT < 4 ? 0.5 : 0.8
  tr.lat = tr.plots.length ? tr.lat + (plot.lat - tr.lat) * a : plot.lat
  tr.lon = tr.plots.length ? tr.lon + (plot.lon - tr.lon) * a : plot.lon
  tr.plots.push(plot)
  if (tr.plots.length > 90) tr.plots.shift()
  if (plot.alt !== null) { tr.alt = plot.alt; tr.altEst = false } else if (tr.alt === null || tr.altEst) { tr.alt = Math.round((ac.alt + st.rng.gauss() * 1500) / 500) * 500; tr.altEst = true }
  if (sec) {
    tr.lastSsr = st.t
    tr.squawk = ac.xpdr.squawk
    tr.ms = ac.xpdr.modeS ? { callsign: ac.xpdr.msCallsign, icao24: ac.xpdr.msIcao24 } : null
    tr.iff4 = ac.xpdr.iff4
  }
  tr.sources = [plot.radar, ...tr.sources.filter((x) => x !== plot.radar)].slice(0, 4)
  // velocity from a plot 20..70 s old
  let ref: Plot | undefined
  for (let i = tr.plots.length - 2; i >= 0; i--) { const dtp = st.t - tr.plots[i].t; if (dtp >= 20) { ref = dtp <= 120 ? tr.plots[i] : undefined; break } }
  if (ref) {
    const dtp = st.t - ref.t
    const gs = (distNm(ref, plot) / dtp) * 3600
    const hdg = bearingDeg(ref, plot)
    tr.gs = tr.gs ? tr.gs + (gs - tr.gs) * 0.5 : gs
    tr.hdg = tr.gs > 25 ? norm360(tr.hdg + (((hdg - tr.hdg + 540) % 360) - 180) * 0.5) : tr.hdg
    const alts = tr.plots.filter((p) => p.alt !== null && st.t - p.t <= 90)
    if (alts.length >= 2) { const f = alts[0], l = alts[alts.length - 1]; if (l.t - f.t >= 15) tr.vs = Math.round((((l.alt as number) - (f.alt as number)) / (l.t - f.t)) * 60 / 100) * 100 }
  }
  const recent = new Set(tr.plots.filter((p) => st.t - p.t < 14).map((p) => p.radar))
  tr.quality = recent.size >= 3 ? 3 : recent.size === 2 ? 2 : 1
}

/** Tracker housekeeping: coast / drop / delete tracks, expire stale transponder data. */
export function maintainTracks(st: GameState) {
  for (const tr of Object.values(st.tracks)) {
    const age = st.t - tr.lastPlot
    const alive = !!st.aircraft[tr.entityId]
    tr.coasting = age > 24 && !tr.dropped
    if (!tr.dropped && (age > 80 || (!alive && age > 35))) { tr.dropped = true; tr.log.push(`${st.t}|Track dropped (no plot ${Math.round(age)}s)`); if (!tr.scored) tr.coasting = false }
    if (tr.squawk && st.t - tr.lastSsr > 60) { tr.squawk = null; tr.ms = null; tr.iff4 = false }
    if (tr.dropped && (age > 1500 || (!alive && age > 120))) {
      delete st.tracks[tr.id]; if (st.trackByEntity[tr.entityId] === tr.id) delete st.trackByEntity[tr.entityId]
    }
  }
}
export const trackAssetsText = (id: string) => ASSET_TYPES[id]?.short ?? id
export function liveTracks(st: GameState): Track[] { return Object.values(st.tracks).filter((t) => !t.dropped) }
export { clamp }

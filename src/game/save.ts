import { ITEM_MAP } from './catalog'

export interface Owned { id: string; typeId: string; base: string }
export interface OwnedBattery { id: string; typeId: string; site: string }
export interface Save {
  v: 2; coins: number; xp: number
  fleet: Owned[]; batteries: OwnedBattery[]; upgrades: Record<string, number>
  stats: { shifts: number; splashes: number; ids: number; emergencies: number; best: number; breaches: number; coinsEarned: number; bestGrade: string; complied: number }
  settings: { volume: number; voice: boolean; sfx: boolean; elevenKey: string; elevenOn: boolean; sweep: boolean; samRings: 'AUTO' | 'ALL' | 'OFF'; quality?: 'AUTO' | 'HIGH' | 'FAST' }
  medals: string[]; tutorial: boolean; redeemed?: string[]; lastShift?: { grade: string; score: number; coins: number }
}
const KEY = 'sd.save.v2'
let nid = Date.now() % 100000
export const newId = (p: string) => `${p}${(nid++).toString(36).toUpperCase()}`
export const freshSave = (): Save => ({
  v: 2, coins: 600, xp: 0,
  fleet: [{ id: newId('J'), typeId: 'F5E', base: 'EGXE' }, { id: newId('J'), typeId: 'HAWK', base: 'EGQL' }, { id: newId('J'), typeId: 'VC10', base: 'EGVN' }],
  batteries: [{ id: newId('S'), typeId: 'STARSTREAK', site: 'LONDON' }], upgrades: {},
  stats: { shifts: 0, splashes: 0, ids: 0, emergencies: 0, best: 0, breaches: 0, coinsEarned: 0, bestGrade: '-', complied: 0 },
  settings: { volume: 0.7, voice: true, sfx: true, elevenKey: '', elevenOn: true, sweep: false, samRings: 'AUTO' }, medals: [], tutorial: false,
})
export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw); const f = freshSave(); return { ...f, ...s, stats: { ...f.stats, ...s.stats }, settings: { ...f.settings, ...s.settings } } }
    // carry over the ElevenLabs key from the older profile format
    const old = localStorage.getItem('sd.profile.v1'); const f = freshSave()
    if (old) { try { f.settings.elevenKey = JSON.parse(old).settings?.elevenKey ?? '' } catch { /* ignore */ } }
    return f
  } catch { return freshSave() }
}
export function writeSave(s: Save) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ } }
export const exportSave = (s: Save) => btoa(unescape(encodeURIComponent(JSON.stringify({ ...s, settings: { ...s.settings, elevenKey: '' } }))))
export function importSave(code: string): Save | null {
  try { const s = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (s.v !== 2 || !Array.isArray(s.fleet)) return null; return { ...freshSave(), ...s } } catch { return null }
}
// ---- progression ----
export const xpFor = (level: number) => 200 + 150 * (level - 1) // xp needed to go from level to level+1
export function levelOf(xp: number) { let l = 1, rest = xp; while (rest >= xpFor(l) && l < 50) { rest -= xpFor(l); l++ } return { level: l, into: rest, need: xpFor(l) } }
export const RANKS = ['Pilot Officer', 'Flying Officer', 'Flight Lieutenant', 'Squadron Leader', 'Wing Commander', 'Group Captain', 'Air Commodore', 'Air Vice-Marshal', 'Air Marshal', 'Air Chief Marshal']
export const rankOf = (level: number) => RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))]
export const MEDALS: { id: string; name: string; desc: string }[] = [
  { id: 'first_shift', name: 'FIRST WATCH', desc: 'Complete your first shift' },
  { id: 'first_splash', name: 'FIRST BLOOD', desc: 'Destroy your first hostile aircraft' },
  { id: 'ace', name: 'ACE', desc: 'Destroy 5 hostiles in total' },
  { id: 'peacemaker', name: 'PEACEMAKER', desc: 'Make 5 intruders turn back with a warning' },
  { id: 'eagle_eye', name: 'EAGLE EYE', desc: '50 correct identifications in total' },
  { id: 'lifesaver', name: 'LIFESAVER', desc: 'Handle 10 emergencies' },
  { id: 'fortress', name: 'FORTRESS', desc: 'Finish a shift with 100% airspace and a raid destroyed' },
  { id: 'grade_a', name: 'TOP OF THE CLASS', desc: 'Earn an A grade' },
  { id: 'veteran', name: 'VETERAN', desc: 'Complete 10 shifts' },
  { id: 'collector', name: 'COLLECTOR', desc: 'Own 8 aircraft' },
]
const CODES: Record<string, number> = { SKYMILLION: 1_000_000 }
export const MAX_LEVEL = 50
const xpForLevel = (lvl: number) => { let x = 0; for (let l = 1; l < lvl; l++) x += xpFor(l); return x }
/** One-time redeemable codes. Returns a description of what was granted, or an error. */
export function redeem(s: Save, code: string): { ok: true; text: string } | { ok: false; text: string } {
  const c = code.trim().toUpperCase()
  if ((s.redeemed ?? []).includes(c)) return { ok: false, text: 'Code already used on this save' }
  if (CODES[c]) { s.coins += CODES[c]; s.redeemed = [...(s.redeemed ?? []), c]; return { ok: true, text: `+${CODES[c].toLocaleString()} Skycoins added` } }
  if (c === 'SKYMAX') {
    s.xp = Math.max(s.xp, xpForLevel(MAX_LEVEL))
    s.upgrades = { radar: 3, scramble: 3, missiles: 3, samReload: 3 }
    s.redeemed = [...(s.redeemed ?? []), c]
    return { ok: true, text: `Promoted to level ${MAX_LEVEL} — everything unlocked, all upgrades maxed` }
  }
  return { ok: false, text: 'Unknown code' }
}
export const sellPrice = (typeId: string) => Math.round((ITEM_MAP[typeId]?.price ?? 0) * 0.5)

export interface Record1 { watches: number; best: number; bestGrade: string; simHours: number }
export interface Profile {
  records: Record<string, Record1>
  tradeBest: Record<string, { grade: string; score: number; result: string }>
  lessonsDone: string[]
  settings: { volume: number; voice: boolean; uiScale: number; sfx: boolean; trail: number; elevenKey?: string }
  totals: { idCorrect: number; incidentsHandled: number; watches: number }
}
const KEY = 'sd.profile.v1', LKEY = 'sd.layout.v1'
const def = (): Profile => ({ records: {}, tradeBest: {}, lessonsDone: [], settings: { volume: 0.7, voice: true, uiScale: 1, sfx: true, trail: 8 }, totals: { idCorrect: 0, incidentsHandled: 0, watches: 0 } })
export function loadProfile(): Profile {
  try { const s = localStorage.getItem(KEY); if (s) return { ...def(), ...JSON.parse(s) } } catch { /* storage unavailable */ }
  return def()
}
export function saveProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ } }
export interface PanelRect { x: number; y: number; w: number; h: number; open: boolean; z: number }
export type Layout = Record<string, PanelRect>
export function loadLayout(): Layout | null { try { const s = localStorage.getItem(LKEY); return s ? JSON.parse(s) : null } catch { return null } }
export function saveLayout(l: Layout) { try { localStorage.setItem(LKEY, JSON.stringify(l)) } catch { /* ignore */ } }
export const clearLayout = () => { try { localStorage.removeItem(LKEY) } catch { /* ignore */ } }

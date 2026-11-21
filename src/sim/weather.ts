import type { GameState, Weather, WxCell } from './types'
import { destPoint } from './geo'

export function initWeather(st: GameState): Weather {
  const r = st.rng
  const mode = st.cfg.weather === 'RANDOM' ? r.pick(['CLEAR', 'RAIN', 'STORM'] as const) : st.cfg.weather
  const sev = mode === 'CLEAR' ? 0.08 : mode === 'RAIN' ? 0.45 : 0.85
  const w: Weather = { windDir: r.range(200, 300), windKt: mode === 'STORM' ? r.range(35, 60) : r.range(8, 30), cells: [], visibilityKm: mode === 'STORM' ? 4 : mode === 'RAIN' ? 8 : 25, severity: sev, front: mode !== 'CLEAR', cloudBase: mode === 'STORM' ? 600 : mode === 'RAIN' ? 1500 : 4000 }
  const n = Math.round(sev * 12)
  for (let i = 0; i < n; i++) w.cells.push(makeCell(st, w, i, true))
  return w
}
let cellId = 1
function makeCell(st: GameState, w: Weather, _i: number, anywhere: boolean): WxCell {
  const r = st.rng
  const lat = anywhere ? r.range(48, 62) : r.range(50, 60), lon = anywhere ? r.range(-22, 4) : r.range(-26, -18)
  const sp = Math.max(4, w.windKt * 0.5) / 3600
  const toward = (w.windDir + 180) % 360
  return { id: cellId++, lat, lon, r: r.range(25, 70), intensity: r.range(0.3, 1) * Math.min(1, 0.4 + w.severity), vx: Math.sin((toward * Math.PI) / 180) * sp, vy: Math.cos((toward * Math.PI) / 180) * sp }
}
export function tickWeather(st: GameState, dt: number) {
  const w = st.weather
  for (const c of w.cells) {
    const p = destPoint(c, (Math.atan2(c.vx, c.vy) * 180) / Math.PI, Math.hypot(c.vx, c.vy) * dt)
    c.lat = p.lat; c.lon = p.lon
    c.intensity = Math.max(0.05, Math.min(1, c.intensity + (st.rng.next() - 0.5) * 0.0006 * dt))
  }
  // recycle cells that left the area; spawn new ones upwind so weather persists
  const target = Math.round(w.severity * 12)
  w.cells = w.cells.filter((c) => c.lon < 20 && c.lat > 40 && c.lat < 68)
  if (w.cells.length < target && st.rng.chance(0.002 * dt)) w.cells.push(makeCell(st, w, 0, false))
  w.visibilityKm = Math.max(2, 25 - w.severity * 21)
}
/** 0..1 weather attenuation along the radar->target path. */
export function wxAttenuation(w: Weather, ra: { lat: number; lon: number }, tg: { lat: number; lon: number }): number {
  if (!w.cells.length) return 0
  let a = 0
  const mid = { lat: (ra.lat + tg.lat) / 2, lon: (ra.lon + tg.lon) / 2 }
  for (const c of w.cells) {
    const k = Math.cos((c.lat * Math.PI) / 180)
    for (const p of [tg, mid]) {
      const d = Math.hypot((p.lat - c.lat) * 60, (p.lon - c.lon) * 60 * k)
      if (d < c.r) a = Math.max(a, c.intensity * (1 - (d / c.r) * 0.5))
    }
  }
  return a
}
export function airfieldWx(w: Weather, p: { lat: number; lon: number }): number {
  let a = 0
  for (const c of w.cells) {
    const d = Math.hypot((p.lat - c.lat) * 60, (p.lon - c.lon) * 60 * Math.cos((c.lat * Math.PI) / 180))
    if (d < c.r) a = Math.max(a, c.intensity)
  }
  return a
}

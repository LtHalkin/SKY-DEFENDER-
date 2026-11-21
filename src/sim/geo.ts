export interface LatLon { lat: number; lon: number }
export const R_NM = 3440.065
const D2R = Math.PI / 180, R2D = 180 / Math.PI
export const rad = (d: number) => d * D2R
export const deg = (r: number) => r * R2D
export const norm360 = (a: number) => ((a % 360) + 360) % 360
export const angDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180 // signed shortest from a to b

export function distNm(a: LatLon, b: LatLon): number {
  const f1 = rad(a.lat), f2 = rad(b.lat), dl = rad(b.lon - a.lon), df = f2 - f1
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}
export function bearingDeg(a: LatLon, b: LatLon): number {
  const f1 = rad(a.lat), f2 = rad(b.lat), dl = rad(b.lon - a.lon)
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return norm360(deg(Math.atan2(y, x)))
}
export function destPoint(a: LatLon, brg: number, nm: number): LatLon {
  const d = nm / R_NM, t = rad(brg), f1 = rad(a.lat), l1 = rad(a.lon)
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t))
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2))
  return { lat: deg(f2), lon: ((deg(l2) + 540) % 360) - 180 }
}
/** Cross-track distance (nm) of p from the polyline, plus along-track index. Flat-earth approx, fine at these scales. */
export function distToPolyline(p: LatLon, pts: LatLon[]): number {
  let best = Infinity
  const k = Math.cos(rad(p.lat))
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].lon * k * 60, ay = pts[i].lat * 60, bx = pts[i + 1].lon * k * 60, by = pts[i + 1].lat * 60
    const px = p.lon * k * 60, py = p.lat * 60
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}
export function pointInPoly(p: LatLon, poly: LatLon[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}
/** Web-Mercator style projection (unit: radians-ish world coords) used by the radar display. */
export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))
export const invMercY = (y: number) => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2)
export const fmtLat = (v: number) => `${String(Math.floor(Math.abs(v))).padStart(2, '0')}${String(Math.round((Math.abs(v) % 1) * 60)).padStart(2, '0')}${v >= 0 ? 'N' : 'S'}`
export const fmtLon = (v: number) => `${String(Math.floor(Math.abs(v))).padStart(3, '0')}${String(Math.round((Math.abs(v) % 1) * 60)).padStart(2, '0')}${v >= 0 ? 'E' : 'W'}`
export const fmtPos = (p: LatLon) => `${fmtLat(p.lat)} ${fmtLon(p.lon)}`
export const fmtTime = (t: number) => { const s = Math.floor(t); const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, ss = s % 60; return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}Z` }
export const fmtHM = (t: number) => { const s = Math.floor(t); return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}${String(Math.floor(s / 60) % 60).padStart(2, '0')}Z` }

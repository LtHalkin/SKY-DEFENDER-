import { invMercY, mercY, rad, R_NM } from '../sim/geo'
import { store, type View } from './store'
export interface Proj { cx: number; cy: number; rpx: number; x: (lon: number) => number; y: (lat: number) => number; inv: (x: number, y: number) => { lat: number; lon: number }; pxPerNm: (lat: number) => number }
export function makeProj(w: number, h: number, v: View = store.view): Proj {
  const ppn = h / 2 / v.rangeNm
  const rpx = ppn * R_NM * Math.cos(rad(v.lat))
  const lon0 = rad(v.lon), my0 = mercY(v.lat), cx = w / 2, cy = h / 2
  return { cx, cy, rpx, x: (lon) => cx + (rad(lon) - lon0) * rpx, y: (lat) => cy - (mercY(lat) - my0) * rpx, inv: (x, y) => ({ lon: (lon0 + (x - cx) / rpx) * (180 / Math.PI), lat: invMercY(my0 + (cy - y) / rpx) }), pxPerNm: (lat) => rpx / (R_NM * Math.cos(rad(lat))) }
}

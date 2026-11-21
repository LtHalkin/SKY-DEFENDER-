import { AIRPORT_MAP } from './data/airports'
import { angDiff, bearingDeg, destPoint, distNm, norm360, rad } from './geo'
import type { Aircraft, GameState } from './types'

export const BOUNDS = { s: 43.0, n: 67.0, w: -31.0, e: 16.0 }
export const outOfBounds = (a: { lat: number; lon: number }) => a.lat < BOUNDS.s || a.lat > BOUNDS.n || a.lon < BOUNDS.w || a.lon > BOUNDS.e

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export type StepResult = 'ok' | 'landed' | 'exited'

function remainingRoute(ac: Aircraft): number {
  const n = ac.nav; let d = 0
  if (n.wpi >= n.wps.length) return 0
  d += distNm(ac, n.wps[n.wpi])
  for (let i = n.wpi; i < n.wps.length - 1; i++) d += distNm(n.wps[i], n.wps[i + 1])
  return d
}
export function windComponent(st: GameState, ac: Aircraft) {
  const w = st.weather
  return w.windKt * Math.min(1, 0.3 + ac.alt / 30000) * Math.cos(rad(ac.hdg - (w.windDir + 180)))
}
function profileTas(ac: Aircraft, cruiseAlt: number): number {
  const frac = clamp(ac.alt / Math.max(8000, cruiseAlt), 0, 1)
  let tas = ac.cruiseKt * (0.62 + 0.38 * frac)
  if (ac.alt < 10000 && ac.typeId !== 'FSTA' && ac.kind !== 'asset' && ac.cruiseKt > 300) tas = Math.min(tas, 250 + ac.alt / 400)
  return tas
}

/** Advance one aircraft by dt seconds. */
export function stepAircraft(st: GameState, ac: Aircraft, dt: number): StepResult {
  const nav = ac.nav
  if (ac.kind === 'phenomenon') return stepPhenomenon(st, ac, dt)
  let tgtHdg = ac.hdg
  let tgtGs: number | undefined
  const cruiseAlt = ac.tgtAlt > 0 ? Math.max(ac.tgtAlt, 5000) : ac.maxAlt

  switch (nav.mode) {
    case 'ROUTE': {
      const wp = nav.wps[nav.wpi]
      if (!wp) { return finishRoute(st, ac) }
      const d = distNm(ac, wp); const brg = bearingDeg(ac, wp)
      tgtHdg = brg
      const next = nav.wps[nav.wpi + 1]
      let lead = 0.4
      if (next) {
        const change = Math.abs(angDiff(brg, bearingDeg(wp, next)))
        const r = ac.gs / 3600 / Math.max(rad(ac.turnRate), 0.01)
        lead = Math.min(25, r * Math.tan(rad(Math.min(change, 120)) / 2) + 0.3)
      } else lead = 1.2
      if (d < lead) { nav.wpi++; if (nav.wpi >= nav.wps.length) { const r = finishRoute(st, ac); if (r !== 'ok') return r } }
      // top of descent for landing flights
      if (nav.final === 'LAND' && nav.dest && ac.phase !== 'DEPARTING') {
        const ap = AIRPORT_MAP[nav.dest]
        const rem = remainingRoute(ac)
        const descNm = Math.max(6, (ac.alt - ap.elev) / 1000 * (ac.cruiseKt > 300 ? 3.2 : 2.2) + 6)
        if (rem < descNm) { ac.tgtAlt = ap.elev + (ac.cruiseKt > 300 ? 1500 : 800); if (ac.phase === 'ENROUTE') ac.phase = 'ARRIVING' }
      }
      break
    }
    case 'GOTO': {
      const wp = nav.wps[0]; if (!wp) break
      tgtHdg = bearingDeg(ac, wp)
      if (distNm(ac, wp) < 1.5) { nav.mode = 'HOLD'; nav.orbit = { c: { lat: wp.lat, lon: wp.lon }, r: 4 } }
      break
    }
    case 'HOLD':
    case 'ORBIT': {
      const o = nav.orbit ?? { c: { lat: ac.lat, lon: ac.lon }, r: 5 }
      if (!nav.orbit) nav.orbit = o
      const d = distNm(ac, o.c), brg = bearingDeg(ac, o.c)
      tgtHdg = norm360(brg - 90 + clamp((d - o.r) * 6, -50, 50))
      break
    }
    case 'TRAIL': {
      const tgt = nav.targetEntity ? st.aircraft[nav.targetEntity] : undefined
      if (!tgt) { nav.mode = 'HOLD'; nav.orbit = { c: { lat: ac.lat, lon: ac.lon }, r: 6 }; break }
      const trail = nav.trailNm ?? 3
      // aim at a point behind the target
      const aim = destPoint(tgt, norm360(tgt.hdg + 180), trail)
      const d = distNm(ac, aim)
      tgtHdg = bearingDeg(ac, aim)
      tgtGs = clamp(tgt.gs + (d > 0.3 ? Math.min(150, d * 12) : 0) * (angDiff(tgtHdg, bearingDeg(ac, tgt)) < 90 ? 1 : -0.3), 130, 650)
      if (d < 0.6) tgtGs = Math.max(tgt.gs * 0.995, 120)
      if (ac.nav.speedOverride) tgtGs = Math.min(tgtGs, ac.nav.speedOverride)
      ac.tgtAlt = tgt.alt + 500
      break
    }
    case 'INTERCEPT': {
      const tgt = nav.targetEntity ? st.aircraft[nav.targetEntity] : undefined
      const aimSrc = nav.wps[0] ?? (tgt ? { lat: tgt.lat, lon: tgt.lon } : null)
      if (!aimSrc) break
      const d = distNm(ac, aimSrc)
      const tv = tgt ? tgt.gs : 0
      const lead = Math.min(20, d / Math.max(1, ac.gs + tv) * tv)
      const aim = tgt ? destPoint(aimSrc, tgt.hdg, lead) : aimSrc
      tgtHdg = bearingDeg(ac, aim)
      break
    }
    case 'LAND': {
      const ap = nav.dest ? AIRPORT_MAP[nav.dest] : undefined
      if (!ap) break
      const d = distNm(ac, ap)
      tgtHdg = bearingDeg(ac, ap)
      ac.phase = 'ARRIVING'
      const todD = Math.max(8, (ac.alt - ap.elev) / 1000 * 3.2 + 5)
      if (d <= todD) ac.tgtAlt = ap.elev + Math.max(0, d - 1.2) * 300
      tgtGs = d < 10 ? Math.max(ac.cruiseKt > 300 ? 150 : ac.cruiseKt * 0.7, Math.min(ac.gs, 130 + d * 14)) : undefined
      if (d < 1.4 && ac.alt < ap.elev + 500) return 'landed'
      break
    }
  }

  // ---- lateral
  const maxTurn = ac.turnRate * dt
  const dh = clamp(angDiff(ac.hdg, tgtHdg), -maxTurn, maxTurn)
  ac.hdg = norm360(ac.hdg + dh)

  // ---- vertical
  const err = ac.tgtAlt - ac.alt
  const climb = Math.max(400, ac.climbFpm * (1 - ac.alt / (ac.maxAlt * 1.2)))
  const desc = ac.cruiseKt > 300 ? 2200 : ac.kind === 'asset' && ac.cruiseKt > 300 ? 3000 : 1000
  const maxDesc = ac.kind === 'asset' && ac.cruiseKt > 400 ? 6000 : desc
  const vs = clamp(err * 60 / dt, -maxDesc, climb)
  ac.vs += clamp(vs - ac.vs, -600 * dt / 3, 600 * dt / 3) * 1
  if (Math.abs(err) < 40 && Math.abs(ac.vs) < 300) ac.vs = 0
  let nalt = ac.alt + (ac.vs / 60) * dt
  if ((err > 0 && nalt > ac.tgtAlt) || (err < 0 && nalt < ac.tgtAlt)) { nalt = ac.tgtAlt; ac.vs = 0 }
  ac.alt = Math.max(0, nalt)

  // ---- speed
  const tas = tgtGs !== undefined ? tgtGs : (nav.speedOverride ?? (ac.kind === 'asset' ? ac.cruiseKt : profileTas(ac, cruiseAlt)))
  const want = tas + (tgtGs !== undefined ? 0 : windComponent(st, ac))
  const accel = ac.kind === 'asset' && ac.cruiseKt > 400 ? 6 : 2.2
  ac.gs += clamp(want - ac.gs, -accel * dt, accel * dt)

  // ---- position
  const p = destPoint(ac, ac.hdg, (ac.gs / 3600) * dt)
  ac.lat = p.lat; ac.lon = p.lon
  if (ac.phase === 'DEPARTING' && ac.alt > 3000) ac.phase = 'ENROUTE'
  if (outOfBounds(ac)) return 'exited'
  return 'ok'
}

function finishRoute(st: GameState, ac: Aircraft): StepResult {
  const nav = ac.nav
  if (nav.final === 'REMOVE') return 'exited'
  if (nav.final === 'LAND' && nav.dest) { nav.mode = 'LAND'; return 'ok' }
  nav.mode = 'HOLD'; nav.orbit = { c: { lat: ac.lat, lon: ac.lon }, r: 5 }; ac.phase = 'ORBIT'
  return 'ok'
}

function stepPhenomenon(st: GameState, ac: Aircraft, dt: number): StepResult {
  const w = st.weather
  if (ac.typeId === 'FLOK') { ac.hdg = norm360(ac.hdg + (st.rng.next() - 0.5) * 30 * dt); ac.gs = 24 + st.rng.next() * 12 }
  else if (ac.typeId === 'ANOM') { ac.hdg = norm360(ac.hdg + (st.rng.next() - 0.5) * 60 * dt); ac.gs = 10 + st.rng.next() * 70; ac.alt = Math.max(0, ac.alt + (st.rng.next() - 0.5) * 300) }
  else { ac.hdg = norm360(w.windDir + 180); ac.gs = Math.max(6, w.windKt * 0.9) }
  const p = destPoint(ac, ac.hdg, (ac.gs / 3600) * dt)
  ac.lat = p.lat; ac.lon = p.lon
  return outOfBounds(ac) ? 'exited' : 'ok'
}

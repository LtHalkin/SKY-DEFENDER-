import { AIRPORTS, AIRPORT_MAP, type Airport } from './data/airports'
import { CIV_TYPES } from './data/aircraftTypes'
import { FIX_MAP } from './data/fixes'
import { OPERATORS, OP_BY_CODE, REGISTRY, type AircraftRecord, type Operator } from './data/registry'
import { bearingDeg, destPoint, distNm, norm360 } from './geo'
import { isSimAirport, routeBetween, routeLength } from './routes'
import type { Aircraft, FlightPlan, GameState, Intent, Role, Wp } from './types'

const SIM_CIV = AIRPORTS.filter((a) => (a.country === 'GB' || a.country === 'IE') && a.kind === 'CIV')
const EU_AP = AIRPORTS.filter((a) => a.country === 'EU')
const NA_AP = AIRPORTS.filter((a) => a.country === 'NA')
const FAR_AP = AIRPORTS.filter((a) => a.country === 'FAR')
const GA_FIELDS = AIRPORTS.filter((a) => a.kind === 'GA' || (a.kind === 'CIV' && a.country !== 'EU' && a.size <= 2 && a.country !== 'NA' && a.country !== 'FAR'))
const PLATFORMS = ['BRENT', 'NINIAN', 'FORTIES', 'PIPER']

export function allocSquawk(st: GameState): string {
  for (;;) {
    const s = `${st.rng.int(0, 7)}${st.rng.int(0, 7)}${st.rng.int(0, 7)}${st.rng.int(0, 7)}`
    if (st.squawkInUse.has(s) || /^(7500|7600|7700|7000|0000|7777|0020|7401|2000|7001)$/.test(s) || s.endsWith('00') && s.startsWith('0')) continue
    st.squawkInUse.add(s); return s
  }
}
const pickWeighted = (st: GameState, list: Airport[]) => st.rng.weighted(list, (a) => Math.max(0.3, a.size))
function activeRegsCalls(st: GameState) {
  const regs = new Set<string>(), calls = new Set<string>()
  for (const p of Object.values(st.plans)) if (p.status === 'FILED' || p.status === 'ACTIVE') { regs.add(p.reg); calls.add(p.callsign) }
  return { regs, calls }
}
function pickRecord(st: GameState, ops: Operator[] | null, roles: Role[] | null, minRange: number, maxRange: number, used: Set<string>, types?: string[]): AircraftRecord | null {
  let cands = REGISTRY.filter((r) => !used.has(r.reg))
  if (ops) { const codes = new Set(ops.map((o) => o.code)); cands = cands.filter((r) => codes.has(r.opCode)) }
  if (roles) cands = cands.filter((r) => roles.includes(r.role))
  if (types) cands = cands.filter((r) => types.includes(r.typeId))
  const fit = cands.filter((r) => CIV_TYPES[r.typeId].rangeNm >= minRange && CIV_TYPES[r.typeId].rangeNm <= maxRange)
  const list = fit.length ? fit : cands
  return list.length ? st.rng.pick(list) : null
}
function cruiseLevel(st: GameState, t: (typeof CIV_TYPES)[string], dist: number, brg: number): number {
  if (t.cat === 'PISTON') return st.rng.pick([2500, 3500, 4500, 5500, 6500])
  if (t.cat === 'HELI') return st.rng.pick([1500, 2000, 2500, 3000])
  const east = brg < 180
  const maxFL = t.maxFL
  const odd = (fl: number) => (east ? (Math.floor(fl / 20) * 20 + 10) : Math.floor(fl / 20) * 20)
  let fl: number
  if (t.cat === 'TURBOPROP') fl = dist < 100 ? st.rng.pick([60, 80, 90]) : st.rng.pick([150, 190, 230, 250])
  else if (dist < 130) fl = st.rng.pick([100, 120, 150, 180])
  else if (dist < 320) fl = st.rng.pick([200, 240, 270, 290])
  else fl = st.rng.pick([330, 350, 370, 390, 410])
  if (fl >= 290) fl = odd(fl)
  return Math.min(fl, maxFL) * 100
}
const routeIsOverflight = (dep: string, arr: string) => !isSimAirport(dep) && !isSimAirport(arr)
const pickLH = (st: GameState, pool: Airport[]) => pickWeighted(st, pool)

interface Draft { rec: AircraftRecord | null; dep: string; arr: string; route: Wp[]; rfl: number; role: Role; callsign: string; remarks: string; rules: 'IFR' | 'VFR'; hasPlan: boolean; hasXpdr: boolean; alt0?: number }

function airlineFlight(st: GameState, used: Set<string>, calls: Set<string>, forceOp?: Operator): Draft | null {
  const r = st.rng
  const ops = forceOp ? [forceOp] : OPERATORS
  const op = forceOp ?? r.weighted(ops, (o) => o.fleet * (o.role === 'CARGO' ? 0.8 : 1))
  let dep: string, arr: string
  const homeUK = op.home === 'GB' || op.home === 'IE'
  const hub = r.pick(op.hubs)
  const lh = !!op.types.find((t) => CIV_TYPES[t].rangeNm > 4200)
  let other: Airport
  const longhaul = lh && r.chance(0.55)
  if (homeUK) {
    if (longhaul) other = pickLH(st, r.chance(0.85) ? NA_AP : FAR_AP)
    else if (op.role === 'REGIONAL') other = r.chance(0.8) ? pickWeighted(st, SIM_CIV.filter((a) => a.icao !== hub)) : pickWeighted(st, EU_AP.filter((a) => distNm(a, AIRPORT_MAP[hub]) < 700))
    else other = r.chance(0.35) ? pickWeighted(st, SIM_CIV.filter((a) => a.icao !== hub && a.size >= 2)) : pickWeighted(st, EU_AP)
    if (!isSimAirport(hub)) return null
    const out = r.chance(0.5); dep = out ? hub : other.icao; arr = out ? other.icao : hub
  } else {
    const home = AIRPORT_MAP[hub]
    const over = r.chance(op.home === 'NA' ? 0.25 : op.home === 'EU' ? 0.3 : 0.2)
    if (over) {
      const pool = op.home === 'NA' ? EU_AP : NA_AP
      other = pickLH(st, pool)
      if (!CIV_TYPES[op.types[0]] || CIV_TYPES[op.types[0]].rangeNm < 3000) other = pickLH(st, EU_AP.filter((a) => a.icao !== hub))
      const out = r.chance(0.5); dep = out ? hub : other.icao; arr = out ? other.icao : hub
    } else {
      other = pickWeighted(st, SIM_CIV.filter((a) => a.size >= (op.home === 'NA' || op.home === 'FAR' ? 4 : 2)))
      const out = r.chance(0.5); dep = out ? hub : other.icao; arr = out ? other.icao : hub
    }
  }
  if (dep === arr) return null
  let route: Wp[]
  try { route = routeBetween(dep, arr) } catch { return null }
  const dist = routeLength(route) + (isSimAirport(dep) ? 0 : 0)
  const gcd = distNm(AIRPORT_MAP[dep], AIRPORT_MAP[arr])
  const rec = pickRecord(st, [op], null, Math.min(gcd * 0.9, 6000), 99999, used)
  if (!rec) return null
  const t = CIV_TYPES[rec.typeId]
  if (!t) return null
  const brg = bearingDeg(route[0], route[route.length - 1])
  let callsign = ''
  for (let i = 0; i < 20; i++) {
    const num = r.chance(0.5) ? r.int(1, 999) : r.int(1000, 9999)
    callsign = `${op.code}${num}${r.chance(0.25) ? L[r.int(0, 25)] : ''}`
    if (!calls.has(callsign)) break
  }
  const hasXpdr = true
  return { rec, dep, arr, route, rfl: cruiseLevel(st, t, dist, brg), role: op.role, callsign, remarks: op.role === 'CARGO' ? 'CARGO' : '', rules: 'IFR', hasPlan: true, hasXpdr }
}
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function bizFlight(st: GameState, used: Set<string>): Draft | null {
  const rec = pickRecord(st, null, ['BIZJET'], 0, 99999, used); if (!rec) return null
  const r = st.rng
  const base = AIRPORT_MAP[rec.homeBase] ?? AIRPORT_MAP.EGLF
  const other = r.chance(0.5) ? r.pick(EU_AP) : r.pick(SIM_CIV.filter((a) => a.size >= 2))
  const out = r.chance(0.5)
  const dep = out ? base.icao : other.icao, arr = out ? other.icao : base.icao
  if (dep === arr || (!isSimAirport(dep) && !isSimAirport(arr))) return null
  let route: Wp[]; try { route = routeBetween(dep, arr) } catch { return null }
  const t = CIV_TYPES[rec.typeId]
  return { rec, dep, arr, route, rfl: cruiseLevel(st, t, routeLength(route), bearingDeg(route[0], route[route.length - 1])), role: 'BIZJET', callsign: rec.reg.replace('-', ''), remarks: 'EXEC', rules: 'IFR', hasPlan: true, hasXpdr: true }
}
function gaFlight(st: GameState, used: Set<string>): Draft | null {
  const rec = pickRecord(st, null, ['GA'], 0, 99999, used); if (!rec) return null
  const r = st.rng
  const dep = AIRPORT_MAP[rec.homeBase] ?? r.pick(GA_FIELDS)
  const dst = r.chance(0.45) ? dep : r.pick(GA_FIELDS)
  const mid1 = destPoint(dep, r.range(0, 360), r.range(15, 70))
  const route: Wp[] = [{ name: dep.icao, lat: dep.lat, lon: dep.lon }, { name: 'LOCAL1', ...mid1 }, ...(r.chance(0.5) ? [{ name: 'LOCAL2', ...destPoint(mid1, r.range(0, 360), r.range(15, 50)) }] : []), { name: dst.icao, lat: dst.lat, lon: dst.lon }]
  const t = CIV_TYPES[rec.typeId]
  const hasPlan = r.chance(0.4)
  return { rec, dep: dep.icao, arr: dst.icao, route, rfl: cruiseLevel(st, t, 60, 0), role: 'GA', callsign: rec.reg.replace('-', ''), remarks: 'VFR LOCAL', rules: 'VFR', hasPlan, hasXpdr: !r.chance(0.12) }
}
function offshoreFlight(st: GameState, used: Set<string>): Draft | null {
  const rec = pickRecord(st, null, ['OFFSHORE'], 0, 99999, used); if (!rec) return null
  const r = st.rng
  const base = AIRPORT_MAP[r.chance(0.8) ? 'EGPD' : 'EGPB']
  const plat = FIX_MAP[r.pick(PLATFORMS)]
  const route: Wp[] = [{ name: base.icao, lat: base.lat, lon: base.lon }, { name: plat.id, lat: plat.lat, lon: plat.lon }, { name: base.icao, lat: base.lat, lon: base.lon }]
  return { rec, dep: base.icao, arr: base.icao, route, rfl: 2000, role: 'OFFSHORE', callsign: rec.reg.replace('-', ''), remarks: 'OFFSHORE SHUTTLE ' + plat.id, rules: 'IFR', hasPlan: true, hasXpdr: true }
}
function emergencyServiceFlight(st: GameState, used: Set<string>, role: 'POLICE' | 'AMBULANCE' | 'COASTGUARD'): Draft | null {
  const rec = pickRecord(st, null, [role], 0, 99999, used); if (!rec) return null
  const r = st.rng
  const base = AIRPORT_MAP[rec.homeBase] ?? AIRPORT_MAP.EGBJ
  let pts: Wp[]
  if (role === 'COASTGUARD') {
    const out = destPoint(base, r.pick([0, 45, 270, 315, 90]), r.range(35, 90))
    pts = [{ name: 'DATUM', ...out }, { name: 'SRCH', ...destPoint(out, r.range(0, 360), 12) }]
  } else {
    const a = destPoint(base, r.range(0, 360), r.range(8, 40))
    pts = [{ name: 'TASK1', ...a }, { name: 'TASK2', ...destPoint(a, r.range(0, 360), r.range(5, 18)) }]
  }
  const route: Wp[] = [{ name: base.icao, lat: base.lat, lon: base.lon }, ...pts, { name: base.icao, lat: base.lat, lon: base.lon }]
  const callsign = role === 'COASTGUARD' ? `RESCUE${r.int(100, 199)}` : role === 'AMBULANCE' ? `HELIMED${r.int(1, 99)}` : `POLICE${r.int(1, 99)}`
  return { rec, dep: base.icao, arr: base.icao, route, rfl: role === 'COASTGUARD' ? 1500 : 1800, role, callsign, remarks: role === 'COASTGUARD' ? 'SAR' : role === 'AMBULANCE' ? 'HEMS' : 'POLICE OPS', rules: 'VFR', hasPlan: role !== 'POLICE' || r.chance(0.5), hasXpdr: true }
}

export function planDraft(st: GameState, kind?: 'AIRLINE' | 'BIZ' | 'GA' | 'OFFSHORE' | 'POLICE' | 'AMBULANCE' | 'COASTGUARD', forceOp?: Operator): Draft | null {
  const { regs, calls } = activeRegsCalls(st)
  const k = kind ?? st.rng.weighted(['AIRLINE', 'BIZ', 'GA', 'OFFSHORE', 'POLICE', 'AMBULANCE', 'COASTGUARD'] as const, (x) => ({ AIRLINE: 66, BIZ: 6, GA: 14, OFFSHORE: 6, POLICE: 2.5, AMBULANCE: 2, COASTGUARD: 1.5 }[x]))
  for (let i = 0; i < 8; i++) {
    let d: Draft | null = null
    if (k === 'AIRLINE') d = airlineFlight(st, regs, calls, forceOp)
    else if (k === 'BIZ') d = bizFlight(st, regs)
    else if (k === 'GA') d = gaFlight(st, regs)
    else if (k === 'OFFSHORE') d = offshoreFlight(st, regs)
    else d = emergencyServiceFlight(st, regs, k)
    if (d) return d
  }
  return null
}

/** Create a filed flight plan; the aircraft entity appears when ETD is reached (or immediately at `progress`). */
export function fileFlight(st: GameState, d: Draft, etd: number, intent: Intent = 'normal'): FlightPlan {
  const rec = d.rec!
  const t = CIV_TYPES[rec.typeId]
  const id = `FP${String(++st.nextId).padStart(5, '0')}`
  const sq = d.hasPlan || d.rules === 'IFR' ? allocSquawk(st) : '7000'
  const len = routeLength(d.route)
  const tas = Math.round(t.cruiseKt)
  const plan: FlightPlan = {
    id, callsign: d.callsign, reg: rec.reg, typeId: rec.typeId, typeName: t.name, rules: d.rules, dep: d.dep, arr: d.arr, route: d.route, rfl: d.rfl, tas,
    squawk: sq, etd, eta: etd + (len / tas) * 3600 + 600, status: 'FILED', remarks: d.remarks, aircraftId: null, operator: rec.operator,
    held: !d.hasPlan, amended: d.hasPlan ? undefined : 'NOFILE', role: d.role, intent, hasXpdr: d.hasXpdr,
  }
  st.plans[id] = plan
  return plan
}

/** Instantiate the aircraft for a plan at fractional progress (0 = at origin). */
export function launchFlight(st: GameState, plan: FlightPlan, progress = 0): Aircraft {
  const rec = REGISTRY.find((r) => r.reg === plan.reg)!
  const t = CIV_TYPES[plan.typeId]
  const r = st.rng
  const route = plan.route.map((w) => ({ ...w }))
  const total = routeLength(route)
  let pos: Wp = route[0], wpi = 1
  if (progress > 0) {
    let target = total * progress, acc = 0
    for (let i = 0; i < route.length - 1; i++) {
      const L2 = distNm(route[i], route[i + 1])
      if (acc + L2 >= target) { const f = (target - acc) / L2; pos = { name: 'X', lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lon: route[i].lon + (route[i + 1].lon - route[i].lon) * f }; wpi = i + 1; break }
      acc += L2
    }
  }
  const depAP = AIRPORT_MAP[plan.dep], arrAP = AIRPORT_MAP[plan.arr]
  const startsAtAirport = progress === 0 && isSimAirport(plan.dep)
  const distFromStart = total * progress, remaining = total * (1 - progress)
  let alt = plan.rfl
  const cl = Math.max(15, (plan.rfl / 1000) * (t.cat === 'JET' ? 3.5 : 3))
  if (isSimAirport(plan.dep) && distFromStart < cl) alt = (depAP?.elev ?? 0) + (plan.rfl - (depAP?.elev ?? 0)) * (distFromStart / cl)
  const dl = Math.max(10, (plan.rfl / 1000) * (t.cat === 'JET' ? 3.2 : 2.4) + 6)
  const landing = isSimAirport(plan.arr)
  if (landing && remaining < dl) alt = Math.min(alt, (arrAP?.elev ?? 0) + 1000 + (plan.rfl - 1000) * (remaining / dl))
  alt = Math.max(alt, startsAtAirport ? depAP.elev : 300)
  const next = route[Math.min(wpi, route.length - 1)]
  const hdg = progress > 0 || !startsAtAirport ? bearingDeg(pos, next) : bearingDeg(route[0], route[1])
  const cruiseKt = t.cruiseKt * r.range(0.96, 1.02)
  const isHeavyFast = t.cat === 'JET'
  const gs = startsAtAirport ? 0.25 * cruiseKt : cruiseKt * (0.62 + 0.38 * Math.min(1, alt / Math.max(8000, plan.rfl)))
  const fixSquawkType = plan.hasXpdr
  const ac: Aircraft = {
    id: `AC${String(++st.nextId).padStart(5, '0')}`, kind: 'civil',
    callsign: plan.callsign, reg: plan.reg, icao24: rec.icao24, typeId: plan.typeId, typeName: t.name, operator: plan.operator, role: plan.role,
    lat: pos.lat, lon: pos.lon, alt, hdg, gs: Math.min(gs, startsAtAirport ? 140 : 1000), vs: 0, tgtAlt: plan.rfl, tgtSpd: cruiseKt,
    nav: { mode: 'ROUTE', wps: route, wpi: Math.max(1, wpi), final: landing ? 'LAND' : 'REMOVE', dest: landing ? plan.arr : null },
    phase: startsAtAirport ? 'DEPARTING' : alt < plan.rfl - 1500 && progress < 0.5 ? 'DEPARTING' : 'ENROUTE',
    xpdr: { on: fixSquawkType, squawk: plan.squawk, modeC: fixSquawkType, modeS: fixSquawkType && (t.cat === 'JET' || t.cat === 'TURBOPROP' || r.chance(0.2)) && plan.role !== 'GA' || (fixSquawkType && r.chance(0.12)), msCallsign: plan.callsign, msIcao24: rec.icao24, iff4: false, identUntil: 0 },
    planId: plan.id, truth: { intent: plan.intent, legit: true, note: 'Routine civil flight', benign: true }, rcs: t.rcs * r.range(0.8, 1.25),
    emitter: t.emitter, spawnedAt: st.t, cruiseKt, maxAlt: t.maxFL * 100, climbFpm: t.climbFpm, turnRate: t.turn,
  }
  if (plan.held) ac.xpdr.squawk = plan.squawk // squawk is assigned to the aircraft regardless of whether RAP holds the plan
  if (!plan.hasXpdr) ac.xpdr.on = false
  // non-planned VFR squawk
  if (plan.rules === 'VFR' && plan.squawk === '7000') ac.xpdr.squawk = '7000'
  void isHeavyFast
  st.aircraft[ac.id] = ac
  plan.aircraftId = ac.id; plan.status = 'ACTIVE'
  st.stats.spawned++
  return ac
}

export function todFactor(hour: number) {
  const h = ((hour % 24) + 24) % 24
  const pts: [number, number][] = [[0, 0.25], [4, 0.2], [6, 0.55], [8, 1], [11, 0.95], [14, 0.85], [17, 1], [20, 0.7], [22, 0.4], [24, 0.25]]
  for (let i = 0; i < pts.length - 1; i++) if (h >= pts[i][0] && h <= pts[i + 1][0]) { const f = (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f }
  return 0.5
}
export const BASE_AIRBORNE = 70
export function targetCount(st: GameState) { return Math.round(BASE_AIRBORNE * st.cfg.traffic * (0.35 + 0.65 * todFactor(st.t / 3600))) }
export function airborneCivil(st: GameState) { let n = 0; for (const a of Object.values(st.aircraft)) if (a.kind === 'civil') n++; return n }
export function plansPending(st: GameState) { let n = 0; for (const p of Object.values(st.plans)) if (p.status === 'FILED') n++; return n }

/** Seeds the starting air picture: aircraft already in flight along their routes plus the next hour's filed plans. */
export function populate(st: GameState, count: number) {
  let made = 0, guard = 0
  while (made < count && guard++ < count * 6) {
    const d = planDraft(st); if (!d) continue
    const plan = fileFlight(st, d, st.t - 60)
    const progress = d.role === 'GA' || d.role === 'POLICE' || d.role === 'AMBULANCE' || d.role === 'COASTGUARD' || d.role === 'OFFSHORE' ? st.rng.range(0.05, 0.9) : st.rng.range(0.03, 0.97)
    const ac = launchFlight(st, plan, progress)
    plan.etd = st.t - (routeLength(plan.route) * progress) / plan.tas * 3600
    plan.eta = st.t + (routeLength(plan.route) * (1 - progress)) / plan.tas * 3600 + 300
    void ac
    made++
  }
  for (let i = 0; i < Math.round(count * 0.5); i++) { const d = planDraft(st); if (d) fileFlight(st, d, st.t + st.rng.range(120, 3000)) }
}
export function opByCode(c: string) { return OP_BY_CODE[c] }
void norm360

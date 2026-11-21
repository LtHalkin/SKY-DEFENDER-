import { AIRPORTS, AIRPORT_MAP } from './data/airports'
import { ASSET_TYPES, CIV_TYPES } from './data/aircraftTypes'
import { FIXES, REGIONS } from './data/fixes'
import { REGISTRY } from './data/registry'
import { bearingDeg, destPoint, distNm, fmtHM, pointInPoly } from './geo'
import { rt, say, flStr } from './comms'
import { ackIncident, closeIncident, openIncident } from './incidents'
import { label, planIndex } from './identification'
import { fileFlight, launchFlight, planDraft } from './traffic'
import { findPath } from './routes'
import type { Aircraft, GameState, IncidentKind, IntelReport, Intent, Radar, Wp } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const NA = 'ABCDEFGHJKLMNPRSTUVWXYZ'
export function areaText(p: { lat: number; lon: number }): string {
  let best = FIXES[0], bd = Infinity
  for (const f of FIXES) { if (f.offshore) continue; const d = distNm(p, f); if (d < bd) { bd = d; best = f } }
  const b = bearingDeg(best, p)
  const c = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16]
  return `${Math.round(bd)}NM ${c} of ${best.id}`
}
const airborne = (st: GameState, f: (a: Aircraft) => boolean) => Object.values(st.aircraft).filter((a) => a.kind === 'civil' && a.phase !== 'LANDED' && f(a))
const insideADR = (a: { lat: number; lon: number }) => pointInPoly(a, REGIONS[0].poly)
const rndHex = (st: GameState) => { for (;;) { const h = (0x600000 + st.rng.int(0, 0xfffff)).toString(16).toUpperCase(); if (!REGISTRY.some((r) => r.icao24 === h)) return h } }

function newSpecial(st: GameState, p: Partial<Aircraft> & { typeId: string; kind: Aircraft['kind']; callsign: string; reg: string; truth: Aircraft['truth']; wps: Wp[]; alt: number }): Aircraft {
  const t = CIV_TYPES[p.typeId]
  const start = p.wps[0], next = p.wps[1] ?? p.wps[0]
  const ac: Aircraft = {
    id: `AC${String(++st.nextId).padStart(5, '0')}`, kind: p.kind, callsign: p.callsign, reg: p.reg, icao24: p.icao24 ?? rndHex(st), typeId: p.typeId, typeName: t.name,
    operator: p.operator ?? 'Unknown', role: p.kind === 'phenomenon' ? 'PHENOM' : 'FOREIGN', lat: start.lat, lon: start.lon, alt: p.alt, hdg: bearingDeg(start, next), gs: t.cruiseKt, vs: 0, tgtAlt: p.alt, tgtSpd: t.cruiseKt,
    nav: { mode: 'ROUTE', wps: p.wps, wpi: 1, final: 'REMOVE', dest: null }, phase: 'ENROUTE',
    xpdr: p.xpdr ?? { on: false, squawk: '0000', modeC: false, modeS: false, msCallsign: '', msIcao24: '', iff4: false, identUntil: 0 },
    planId: null, truth: p.truth, rcs: t.rcs, emitter: p.emitter ?? 'NONE', spawnedAt: st.t, cruiseKt: t.cruiseKt, maxAlt: t.maxFL * 100, climbFpm: t.climbFpm, turnRate: t.turn,
  }
  st.aircraft[ac.id] = ac; st.stats.spawned++
  return ac
}
function pend(st: GameState, ent: Aircraft, kind: IncidentKind, title: string, severity: 1 | 2 | 3, needs: string, deadlineSec: number, announce: string) {
  st.pending.push({ entityId: ent.id, kind, title, severity, needs, deadlineSec, announce, created: st.t, intent: ent.truth.intent })
}

// ---------------- event spawners -------------------------------------------------------------
export interface SpawnOpts { start?: { lat: number; lon: number } }
function spawnStrayed(st: GameState, opts?: SpawnOpts): Aircraft | null {
  const r = st.rng
  const d = planDraft(st, 'GA'); if (!d) return null
  const brg = r.pick([250, 280, 300, 330, 20, 60, 100, 130, 160, 200])
  const start = opts?.start ?? destPoint({ lat: 53.5, lon: -3 }, brg, r.range(230, 330))
  const field = r.pick(AIRPORTS.filter((a) => a.kind === 'GA' || a.size <= 2).filter((a) => a.country === 'GB' || a.country === 'IE'))
  const mid = destPoint(start, bearingDeg(start, field) + r.range(-12, 12), distNm(start, field) * 0.6)
  d.dep = field.icao; d.arr = field.icao; d.route = [{ name: 'X', ...start }, { name: 'MID', ...mid }, { name: field.icao, lat: field.lat, lon: field.lon }]
  d.hasPlan = false; d.rules = 'VFR'; d.hasXpdr = r.chance(0.4); d.remarks = 'NONE'
  const plan = fileFlight(st, d, st.t - 60, 'strayed')
  const ac = launchFlight(st, plan, 0)
  ac.lat = start.lat; ac.lon = start.lon; ac.alt = r.range(3000, 8000); ac.tgtAlt = ac.alt; ac.hdg = bearingDeg(start, mid); ac.gs = ac.cruiseKt; ac.phase = 'ENROUTE'; ac.nav.wpi = 1
  ac.xpdr.squawk = r.chance(0.6) ? '7000' : '0000'; ac.xpdr.modeS = false; ac.truth = { intent: 'strayed', legit: true, benign: true, note: 'Lost light aircraft, no flight plan' }
  pend(st, ac, 'STRAYED', ac.xpdr.on ? 'UNCORRELATED LIGHT AIRCRAFT INBOUND' : 'UNIDENTIFIED PRIMARY CONTACT INBOUND', 2, 'IDENTIFY: ATC QUERY / VISUAL ID', 1200, `New contact ${areaText(ac)}, ${ac.xpdr.on ? 'squawk ' + ac.xpdr.squawk + ', no flight plan' : 'primary only'}, heading ${Math.round(ac.hdg)}.`)
  return ac
}
function spawnForeign(st: GameState, opts?: SpawnOpts): Aircraft {
  const r = st.rng
  const north = opts?.start ? false : r.chance(0.6)
  const wps: Wp[] = north
    ? (() => { const x = r.range(-9, 2); return [{ name: 'S', lat: 66.4, lon: x }, { name: 'A', lat: 61.9, lon: x - 1 }, { name: 'B', lat: r.range(59.2, 60.4), lon: x - r.range(4, 7) }, { name: 'C', lat: 64.5, lon: x - 16 }] })()
    : opts?.start ? [{ name: 'S', ...opts.start }, { name: 'A', lat: opts.start.lat - 0.6, lon: -16.5 }, { name: 'B', lat: opts.start.lat - 0.8, lon: -11.8 }, { name: 'C', lat: opts.start.lat + 3.5, lon: -19 }]
    : (() => { const y = r.range(54.5, 59.5); return [{ name: 'S', lat: y + 3, lon: -29.5 }, { name: 'A', lat: y + 1.5, lon: -18 }, { name: 'B', lat: y, lon: r.range(-12.8, -11) }, { name: 'C', lat: y + 5.5, lon: -22 }] })()
  const typeId = r.chance(0.7) ? 'FSTA' : 'FSTB'
  const ac = newSpecial(st, { typeId, kind: 'foreign', callsign: `${NA[r.int(0, 22)]}${NA[r.int(0, 22)]}${r.int(100, 999)}`, reg: `RF-${r.int(10000, 99999)}`, truth: { intent: 'foreignState', legit: false, benign: true, note: 'Non-cooperative foreign state aircraft in transit' }, wps, alt: r.pick([25000, 29000, 33000]), operator: 'Foreign state', icao24: 'UNKN' })
  pend(st, ac, 'FOREIGN_STATE', 'NON-COOPERATIVE LARGE AIRCRAFT APPROACHING ADIZ', 3, 'IDENTIFY (VID) + SHADOW/MONITOR', 1500, `Primary-only contact, no SSR, ${areaText(ac)}, ${Math.round(ac.gs)}kt, tracking ${Math.round(ac.hdg)}. Large aircraft.`)
  if (r.chance(0.65) && st.cfg.intel) makeIntel(st, { source: 'SIGINT', accuracy: 'ACCURATE', ent: ac, text: `Large foreign state aircraft departed northern base ${fmtHM(st.t - 5400)}, tracking towards the ${north ? 'Norwegian Sea / Faeroes gap' : 'North Atlantic approaches'}. Intentions unknown.`, incidentKind: 'FOREIGN_STATE' })
  return ac
}
function spawnAnomaly(st: GameState): Aircraft {
  const r = st.rng
  const kind = r.pick(['BALN', 'FLOK', 'ANOM'] as const)
  const t = CIV_TYPES[kind]
  let p: { lat: number; lon: number }, alt: number
  if (kind === 'BALN') { p = { lat: r.range(50, 60), lon: r.range(-14, -2) }; alt = r.range(28000, 38000) }
  else if (kind === 'FLOK') { p = { lat: r.range(51, 58), lon: r.range(-6, 1) }; alt = r.range(800, 3500) }
  else { const rad = r.pick(st.radars.filter((x) => !x.airborne)); p = destPoint(rad, r.range(0, 360), r.range(25, 90)); alt = r.range(1500, 8000) }
  const wps = [{ name: 'S', ...p }, { name: 'E', ...destPoint(p, r.range(0, 360), 30) }]
  const ac = newSpecial(st, { typeId: kind, kind: 'phenomenon', callsign: kind, reg: kind, truth: { intent: 'phenomenon', legit: true, benign: true, note: t.name }, wps, alt })
  ac.nav.wps = [wps[0]]; ac.nav.wpi = 0; ac.deviateAt = st.t + r.range(1500, 2700)
  pend(st, ac, 'ANOMALY', 'UNUSUAL PRIMARY RETURN', 1, 'ASSESS: CLUTTER OR AIRCRAFT?', 1500, `Slow primary-only return ${areaText(ac)}, ${Math.round(ac.gs)}kt, no SSR.`)
  if (r.chance(0.35) && st.cfg.intel) makeIntel(st, { source: 'COASTAL OBSERVER', accuracy: 'FALSE', ent: ac, text: `Observer reports ${kind === 'FLOK' ? 'low aircraft-like lights' : 'unlit aircraft'} ${areaText(ac)}. Single source, unconfirmed.`, incidentKind: 'ANOMALY' })
  return ac
}
function spawnCloned(st: GameState, opts?: SpawnOpts): Aircraft | null {
  const r = st.rng
  const victims = airborne(st, (a) => (a.role === 'AIRLINER' || a.role === 'CARGO') && !!a.planId && a.truth.intent === 'normal' && a.alt > 8000)
  if (!victims.length) return null
  const v = r.pick(victims)
  const brg = r.pick([270, 300, 340, 20, 60, 120, 200])
  const start = opts?.start ?? destPoint({ lat: 53.5, lon: -3 }, brg, r.range(240, 330))
  const field = r.pick(AIRPORTS.filter((a) => a.kind === 'GA' && a.country === 'GB'))
  const typeId = r.pick(['BE20', 'C550', 'PA34', 'BE58'])
  const reg = 'G-' + Array.from({ length: 4 }, () => NA[r.int(0, 22)]).join('')
  const dupSq = r.chance(0.5)
  const ac = newSpecial(st, { typeId, kind: 'civil', callsign: reg.replace('-', ''), reg, truth: { intent: 'cloned', legit: false, benign: false, note: `Aircraft ${reg} using callsign ${v.callsign} without authority` }, wps: [{ name: 'S', ...start }, { name: field.icao, lat: field.lat, lon: field.lon }], alt: r.range(9000, 16000), operator: 'Unregistered operator', icao24: rndHex(st),
    xpdr: { on: true, squawk: dupSq ? v.xpdr.squawk : `${r.int(0, 7)}${r.int(1, 7)}${r.int(0, 7)}${r.int(0, 7)}`, modeC: true, modeS: true, msCallsign: v.callsign, msIcao24: rndHex(st), iff4: false, identUntil: 0 }, emitter: 'NAV' })
  ac.nav.final = 'LAND'; ac.nav.dest = field.icao; ac.role = 'GA'
  pend(st, ac, 'CLONED_ID', `DUPLICATE IDENTITY ${v.callsign}`, 3, 'COMPARE SOURCES: REGISTRY / ATC / VID', 1500, `Second aircraft transmitting callsign ${v.callsign}, ${areaText(ac)} — origin unknown.`)
  if (st.cfg.intel && r.chance(0.7)) makeIntel(st, { source: 'LIAISON', accuracy: 'PARTIAL', ent: ac, text: `Possible unauthorised use of airline callsign ${rt(v.callsign)} by light aircraft entering from the ${brg > 180 ? 'west' : 'east'}. Details incomplete.`, incidentKind: 'CLONED_ID' })
  return ac
}
function spawnMissingPlan(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => (a.role === 'CARGO' || a.role === 'AIRLINER' || a.role === 'BIZJET') && !!a.planId && a.truth.intent === 'normal' && a.phase === 'ENROUTE' && a.alt > 8000)
  if (!c.length) return null
  const ac = st.rng.pick(c); const plan = st.plans[ac.planId!]
  plan.held = true; plan.remarks += ' [PLAN NOT RECEIVED AT RAP]'
  ac.truth = { intent: 'noPlan', legit: true, benign: true, note: 'Flight plan exists at ATC but was not distributed' }
  pend(st, ac, 'MISSING_PLAN', 'CONTACT WITH NO FLIGHT PLAN', 2, 'ATC QUERY / CORRELATE', 1200, `Contact squawking ${ac.xpdr.squawk} ${areaText(ac)}, no flight plan held.`)
  if (st.cfg.intel && st.rng.chance(0.5)) makeIntel(st, { source: 'CIVIL ATC', accuracy: 'PARTIAL', ent: ac, text: `Flight plan distribution failure reported at area centre — some plans may not have reached surveillance. Affected flights not listed.`, incidentKind: 'MISSING_PLAN' })
  return ac
}
function spawnCommsFail(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => ['AIRLINER', 'REGIONAL', 'CARGO', 'BIZJET'].includes(a.role) && a.truth.intent === 'normal' && !a.emergency && insideADR(a))
  if (!c.length) return null
  const ac = st.rng.pick(c)
  ac.xpdr.squawk = '7600'; ac.emergency = { kind: '7600', since: st.t }; ac.truth = { intent: 'commsFail', legit: true, benign: true, note: 'Radio failure, continuing to destination' }
  const inc = openIncident(st, { kind: 'COMMS_7600', title: `${ac.callsign} 7600 COMMS FAILURE`, severity: 1, entityId: ac.id, needs: 'ACKNOWLEDGE; MONITOR UNTIL LANDING', deadlineSec: 300 })
  say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text: `Surveillance, area. ${rt(ac)} now squawking seven six zero zero, no communications. ${ac.typeId}, ${flStr(ac.alt)}, ${areaText(ac)}. Intentions to continue to destination.`, voice: 'CONTROLLER', sev: 'PRIORITY', ref: inc.id, refKind: 'incident' })
  st.events.push({ type: 'emergency', trackId: st.trackByEntity[ac.id] ?? '', code: '7600' })
  return ac
}
function nearestCivAirport(a: { lat: number; lon: number }, minSize = 2) {
  return AIRPORTS.filter((x) => (x.country === 'GB' || x.country === 'IE') && x.kind === 'CIV' && x.size >= minSize).sort((p, q) => distNm(a, p) - distNm(a, q))[0]
}
function spawnEmergency(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => ['AIRLINER', 'REGIONAL', 'CARGO', 'BIZJET', 'GA'].includes(a.role) && a.truth.intent === 'normal' && !a.emergency && insideADR(a) && a.alt > 2500 && a.phase !== 'ARRIVING' && a.xpdr.on)
  if (!c.length) return null
  const ac = st.rng.pick(c)
  const ap = nearestCivAirport(ac, ac.role === 'GA' ? 1 : 3)
  ac.xpdr.squawk = '7700'; ac.emergency = { kind: '7700', since: st.t, divertTo: ap.icao }
  ac.truth = { intent: 'emergency', legit: true, benign: true, note: 'Genuine emergency, diverting' }
  ac.nav = { mode: 'LAND', wps: [], wpi: 0, final: 'LAND', dest: ap.icao }; ac.tgtAlt = Math.min(ac.alt, 12000)
  const reason = st.rng.pick(['medical emergency on board', 'engine failure', 'smoke in the cabin', 'hydraulic failure', 'low fuel'])
  const inc = openIncident(st, { kind: 'EMERGENCY_7700', title: `${ac.callsign} 7700 — ${reason.toUpperCase()}`, severity: 2, entityId: ac.id, needs: `ACKNOWLEDGE; ALERT ${ap.icao} BEFORE LANDING`, deadlineSec: Math.max(300, (distNm(ac, ap) / Math.max(ac.gs, 150)) * 3600) })
  say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text: `Mayday relay. ${rt(ac)}, ${ac.typeId}, ${reason}, squawking seven seven zero zero, diverting to ${ap.name}. ${flStr(ac.alt)}, ${areaText(ac)}.`, voice: 'CONTROLLER', sev: 'URGENT', ref: inc.id, refKind: 'incident' })
  st.events.push({ type: 'emergency', trackId: st.trackByEntity[ac.id] ?? '', code: '7700' })
  return ac
}
function spawnUnlawful(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => ['AIRLINER'].includes(a.role) && a.truth.intent === 'normal' && !a.emergency && insideADR(a) && a.alt > 15000)
  if (!c.length) return null
  const ac = st.rng.pick(c)
  ac.xpdr.squawk = '7500'; ac.emergency = { kind: '7500', since: st.t }; ac.truth = { intent: 'unlawful', legit: true, benign: false, note: 'Unlawful interference on board — aircraft diverted from plan' }
  const ap = st.rng.pick(AIRPORTS.filter((a) => (a.country === 'GB' || a.country === 'IE') && a.kind === 'CIV' && a.size >= 3 && distNm(a, ac) > 60).sort((p, q) => distNm(p, ac) - distNm(q, ac)).slice(0, 3))
  const off = destPoint(ac, (ac.hdg + st.rng.pick([-70, 70]) + 360) % 360, 30)
  ac.tgtAlt = Math.min(ac.tgtAlt, 20000)
  ac.nav = { mode: 'ROUTE', wps: [{ name: 'DEV', ...off }, { name: ap.icao, lat: ap.lat, lon: ap.lon }], wpi: 0, final: 'LAND', dest: ap.icao }
  const inc = openIncident(st, { kind: 'UNLAWFUL_7500', title: `${ac.callsign} 7500 UNLAWFUL INTERFERENCE`, severity: 3, entityId: ac.id, needs: 'ACKNOWLEDGE; SHADOW; ALERT AIRFIELD', deadlineSec: 1800 })
  say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text: `Priority. ${rt(ac)} squawking seven five zero zero, flight has deviated from filed route, not responding to calls. ${ac.typeId}, ${flStr(ac.alt)}, ${areaText(ac)}.`, voice: 'CONTROLLER', sev: 'URGENT', ref: inc.id, refKind: 'incident' })
  st.events.push({ type: 'emergency', trackId: st.trackByEntity[ac.id] ?? '', code: '7500' })
  if (st.cfg.intel) makeIntel(st, { source: 'POLICE LIAISON', accuracy: 'PARTIAL', ent: ac, text: `Unverified message received concerning flight ${rt(ac)}. Details unclear; treat with caution.`, incidentKind: 'UNLAWFUL_7500' })
  return ac
}
function spawnXpdrFault(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => ['AIRLINER', 'REGIONAL', 'CARGO', 'BIZJET'].includes(a.role) && a.truth.intent === 'normal' && !a.emergency && a.xpdr.on && insideADR(a) && !!a.planId)
  if (!c.length) return null
  const ac = st.rng.pick(c)
  if (st.rng.chance(0.5)) { ac.xpdr.on = false } else { ac.xpdr.squawk = `${st.rng.int(0, 7)}${st.rng.int(0, 7)}${st.rng.int(0, 7)}${st.rng.int(0, 7)}`; ac.xpdr.modeS = false }
  ac.truth = { intent: 'xpdrFault', legit: true, benign: true, note: 'Transponder malfunction' }
  pend(st, ac, 'XPDR_FAULT', 'TRACK WITH INCONSISTENT TRANSPONDER DATA', 2, 'ATC QUERY / COMPARE SOURCES', 1200, `Track ${areaText(ac)} — ${ac.xpdr.on ? 'unexpected squawk ' + ac.xpdr.squawk : 'transponder return lost, primary only'}.`)
  return ac
}
function spawnDeviation(st: GameState): Aircraft | null {
  const c = airborne(st, (a) => ['AIRLINER', 'CARGO', 'BIZJET'].includes(a.role) && a.truth.intent === 'normal' && a.nav.mode === 'ROUTE' && a.nav.wps.length - a.nav.wpi >= 3 && a.alt > 12000 && !a.emergency)
  if (!c.length) return null
  const ac = st.rng.pick(c)
  const n = ac.nav
  const a = n.wps[n.wpi], b = n.wps[n.wpi + 1]
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
  const off = destPoint(mid, bearingDeg(a, b) + st.rng.pick([-90, 90]), st.rng.range(50, 75))
  n.wps = [{ name: 'DEV', ...off }, ...n.wps.slice(n.wpi)]; n.wpi = 0
  ac.truth = { intent: 'diverting', legit: true, benign: true, note: 'Weather deviation, plan not yet amended' }
  const plan = st.plans[ac.planId!]
  st.scheduled.push({ at: st.t + st.rng.range(1500, 2400), fn: 'amend', args: [plan.id, off.lat, off.lon] })
  pend(st, ac, 'PLAN_DEVIATION', `${ac.callsign} DEVIATING FROM FILED ROUTE`, 2, 'ATC QUERY: WEATHER OR INTENT?', 1500, `Track ${plan.callsign} leaving filed route near ${areaText(ac)}.`)
  return ac
}
function spawnSAR(st: GameState) {
  const d = planDraft(st, 'COASTGUARD'); if (!d) return
  const plan = fileFlight(st, d, st.t + 120)
  const inc = openIncident(st, { kind: 'SAR', title: `SAR TASKING — ${d.callsign}`, severity: 1, entityId: null, needs: 'AWARENESS', deadlineSec: 3000 })
  say(st, { channel: 'ATC', from: 'COASTGUARD', to: 'OPS', text: `Coastguard to surveillance. ${rt(d.callsign)} launching from ${AIRPORT_MAP[d.dep]?.name ?? d.dep} for a vessel in difficulty. Request avoid low-level tasking.`, voice: 'CONTROLLER', ref: inc.id, refKind: 'incident' })
  inc.entityId = null; st.flags['sar:' + plan.id] = inc.id
}
function radarFault(st: GameState) {
  const r = st.rng
  const cands = st.radars.filter((x) => !x.airborne && x.status === 'OPERATIONAL')
  if (!cands.length || !st.cfg.radarFaults) return
  const rd = r.pick(cands)
  if (r.chance(0.5)) { rd.condition = r.range(20, 45); rd.status = 'DEGRADED'; rd.note = 'Transmitter power loss'; }
  else { rd.status = 'OFFLINE'; rd.condition = r.range(10, 30); rd.note = 'Power supply failure' }
  const inc = openIncident(st, { kind: 'RADAR_FAULT', title: `${rd.name.toUpperCase()} — ${rd.status}`, severity: rd.status === 'OFFLINE' ? 3 : 2, entityId: null, needs: 'DISPATCH ENGINEERS; COVER GAP WITH AEW', deadlineSec: 3600, radarId: rd.id })
  st.flags['rf:' + inc.id] = rd.id
  say(st, { channel: 'OPS', from: rd.name.toUpperCase(), to: 'OPS', text: `${rd.name}: ${rd.note}. Station ${rd.status.toLowerCase()}.`, voice: 'OPS', sev: 'URGENT', ref: rd.id, refKind: 'radar' })
}
function interference(st: GameState) {
  const rd = st.rng.pick(st.radars.filter((x) => !x.airborne && x.status !== 'OFFLINE')); if (!rd) return
  rd.interference = st.rng.range(0.3, 0.7); rd.note = 'Interference / jamming'
  say(st, { channel: 'OPS', from: rd.name.toUpperCase(), to: 'OPS', text: `${rd.name} reports heavy interference on the primary channel. Detection degraded.`, voice: 'OPS', sev: 'PRIORITY', ref: rd.id, refKind: 'radar' })
}
function weatherFront(st: GameState) {
  st.weather.severity = Math.min(1, st.weather.severity + 0.3); st.weather.windKt = Math.min(65, st.weather.windKt + 12)
  say(st, { channel: 'OPS', from: 'MET OFFICE', to: 'ALL STATIONS', text: 'Weather warning. A frontal system is approaching from the Atlantic. Expect heavy precipitation, radar attenuation and reduced airfield visibility.', voice: 'OPS', sev: 'PRIORITY' })
}

type Ev = { id: string; w: (t: number) => number; run: (st: GameState, opts?: SpawnOpts) => unknown }
const EVENTS: Ev[] = [
  { id: 'strayed', w: () => 3, run: spawnStrayed }, { id: 'anomaly', w: () => 2.2, run: spawnAnomaly }, { id: 'missing', w: () => 2, run: spawnMissingPlan },
  { id: '7600', w: () => 2.2, run: spawnCommsFail }, { id: 'xpdr', w: () => 1.5, run: spawnXpdrFault }, { id: 'deviation', w: (t) => (t > 0.08 ? 2 : 0), run: spawnDeviation },
  { id: '7700', w: () => 2.2, run: spawnEmergency }, { id: 'foreign', w: (t) => (t > 0.15 ? 0.8 + t * 3 : 0), run: spawnForeign },
  { id: 'cloned', w: (t) => (t > 0.3 ? t * 2.6 : 0), run: spawnCloned }, { id: '7500', w: (t) => (t > 0.45 ? t * 1.5 : 0), run: spawnUnlawful },
  { id: 'sar', w: () => 1, run: spawnSAR }, { id: 'radar', w: () => 1.1, run: radarFault }, { id: 'interf', w: (t) => 0.5 + t, run: interference }, { id: 'front', w: () => 0.5, run: weatherFront },
  { id: 'noise', w: () => 1.5, run: (st: GameState) => { if (st.cfg.intel) makeIntel(st, { source: st.rng.pick(['COASTAL OBSERVER', 'LIAISON', 'CIVIL ATC', 'SIGINT']), accuracy: st.rng.pick(['FALSE', 'MISLEADING', 'FALSE']), ent: null, text: '' }) } },
]
export function spawnEvent(st: GameState, id: string, opts?: SpawnOpts) { return EVENTS.find((e) => e.id === id)?.run(st, opts) }
export function tensionOf(st: GameState) {
  const hrs = (st.t - st.startT) / 3600
  const adj = (st.flags.tensionAdj as number) ?? 0
  return clamp(st.cfg.tension0 + (st.cfg.growth ? 0.13 * hrs : 0) + adj, 0, 1.5)
}
export function directorStep(st: GameState) {
  st.tension = tensionOf(st)
  if (!st.cfg.incidents || st.t < st.nextEvent) return
  const tn = st.tension
  let ev = st.rng.weighted(EVENTS, (e) => e.w(tn))
  // civil-only events fail quietly if there is no suitable aircraft; retry a few
  for (let i = 0; i < 4; i++) { const r = ev.run(st); if (r !== null) break; ev = st.rng.weighted(EVENTS, (e) => e.w(tn)) }
  const base = st.cfg.mode === 'INSTANT' || st.flags.quick ? 140 : 1500
  st.nextEvent = st.t + (base / (st.cfg.complexity * 0.9 + 0.15) / (1 + tn * 2.6)) * st.rng.range(0.6, 1.4)
  void ev
}
export function bumpTension(st: GameState, d: number) { st.flags.tensionAdj = clamp(((st.flags.tensionAdj as number) ?? 0) + d, -0.15, 0.5) }

// ---------------- intel ---------------------------------------------------------------------
export function makeIntel(st: GameState, p: { source: string; accuracy: IntelReport['accuracy']; ent: Aircraft | null; text: string; incidentKind?: string }) {
  const r = st.rng
  let text = p.text
  let lat: number | null = null, lon: number | null = null
  if (p.ent) { lat = p.ent.lat + r.range(-0.6, 0.6); lon = p.ent.lon + r.range(-1, 1) }
  else {
    lat = r.range(50, 60); lon = r.range(-12, 2)
    if (!text) text = r.pick([
      `Source reports low unlit aircraft heading inland ${areaText({ lat, lon })}. Single source, unconfirmed.`,
      `Allied liaison: possible aircraft without flight plan crossing at high level near ${areaText({ lat, lon })}. Time uncertain.`,
      `Observer reports aircraft behaving erratically ${areaText({ lat, lon })}; callsign not obtained.`,
      `Possible transponder anomaly affecting airline traffic in the ${areaText({ lat, lon })} area. Cause unknown.`,
      `Unconfirmed report of an unscheduled military-type transit through the North Sea. Source reliability untested.`,
    ])
  }
  const lett = p.accuracy === 'ACCURATE' ? r.pick(['A', 'B', 'B']) : p.accuracy === 'PARTIAL' ? r.pick(['B', 'C', 'C']) : p.accuracy === 'MISLEADING' ? r.pick(['B', 'C', 'D']) : r.pick(['C', 'D', 'E', 'B'])
  const num = p.accuracy === 'ACCURATE' ? r.pick([1, 2]) : p.accuracy === 'PARTIAL' ? r.pick([2, 3, 3]) : r.pick([3, 4, 5, 2])
  const rep: IntelReport = { id: `IR${String(st.intel.length + 1).padStart(3, '0')}`, t: st.t, source: p.source, grade: `${lett}${num}`, text, lat, lon, radius: p.ent ? 90 : 120, linkEntity: p.ent?.id ?? null, accuracy: p.accuracy, assessed: null, incidentKind: p.incidentKind }
  st.intel.push(rep)
  say(st, { channel: 'INTEL', from: p.source, to: 'OPS', text: `Intelligence report ${rep.id}, grade ${rep.grade}: ${text}`, voice: 'INTEL', sev: 'PRIORITY', ref: rep.id, refKind: 'intel' })
  return rep
}
export function assessIntel(st: GameState, id: string, verdict: 'CREDIBLE' | 'DOUBTFUL' | 'DISREGARD', trackId?: string) {
  const rp = st.intel.find((x) => x.id === id); if (!rp) return
  rp.assessed = verdict; rp.assessedAt = st.t
  if (trackId && st.tracks[trackId]) { rp.linkedTrack = trackId; if (!st.tracks[trackId].intelLinks.includes(id)) st.tracks[trackId].intelLinks.push(id) }
  if (!rp.scored) {
    rp.scored = true
    const credibleTruth = rp.accuracy === 'ACCURATE' || rp.accuracy === 'PARTIAL'
    if ((verdict === 'CREDIBLE') === credibleTruth) st.score.intelCorrect++; else st.score.intelWrong++
  }
}
export const intelFor = (st: GameState, trackId: string) => st.intel.filter((i) => st.tracks[trackId] && i.linkEntity === st.tracks[trackId].entityId)

// ---------------- player actions tied to events ---------------------------------------------------
export function notifyAirfield(st: GameState, incidentId: string) {
  const inc = st.incidents.find((i) => i.id === incidentId); if (!inc || !inc.entityId) return
  const ac = st.aircraft[inc.entityId]; if (!ac) return
  const dest = ac.emergency?.divertTo ?? ac.nav.dest
  if (!dest) { inc.log.push(`${fmtHM(st.t)} No destination to alert`); return }
  inc.actioned = true; if (!inc.acked) ackIncident(st, inc.id)
  inc.log.push(`${fmtHM(st.t)} ${AIRPORT_MAP[dest]?.name ?? dest} alerted`)
  const af = st.airfields[dest]; if (af) af.alert = { kind: 'EMERGENCY', until: st.t + 3600 }
  say(st, { channel: 'AIRFIELD', from: 'OPS', to: (AIRPORT_MAP[dest]?.name ?? dest).toUpperCase(), text: `${AIRPORT_MAP[dest]?.name ?? dest}, surveillance. ${rt(ac)} ${ac.emergency ? 'has declared an emergency' : 'requires attention'}, estimate in ${Math.round(distNm(ac, AIRPORT_MAP[dest]) / Math.max(ac.gs, 120) * 60)} minutes. Request full emergency services.`, voice: 'OPS', ref: inc.id, refKind: 'incident' })
  st.scheduled.push({ at: st.t + 10, fn: 'airfieldAck', args: [dest, inc.id] })
}
export function dispatchEngineers(st: GameState, radarId: string, kind: 'REPAIR' | 'PM'): string | null {
  const rd = st.radars.find((x) => x.id === radarId); if (!rd || rd.airborne) return 'Not a ground station'
  if (st.engineersFree <= 0) return 'No engineering teams free'
  if (rd.status === 'MAINTENANCE') return 'Already under maintenance'
  if (kind === 'PM' && rd.condition > 92 && rd.status === 'OPERATIONAL') return 'Equipment in good condition'
  st.engineersFree--
  rd.repairTeam = true; rd.repairUntil = st.t + 600 + (100 - rd.condition) * 20 * (kind === 'PM' ? 0.6 : 1)
  rd.status = 'MAINTENANCE'; rd.note = kind === 'PM' ? 'Preventive maintenance in progress' : 'Repair in progress'
  say(st, { channel: 'OPS', from: 'ENGINEERING', to: 'OPS', text: `Engineering team dispatched to ${rd.name}. Estimated ${Math.round((rd.repairUntil - st.t) / 60)} minutes.`, voice: 'OPS', ref: rd.id, refKind: 'radar', speak: false })
  for (const inc of st.incidents) if (inc.radarId === rd.id && inc.closed === null) { inc.actioned = true; if (!inc.acked) ackIncident(st, inc.id) }
  return null
}
export function stepRadarHealth(st: GameState) {
  for (const rd of st.radars) {
    if (rd.airborne) continue
    if (rd.interference > 0) { rd.interference = Math.max(0, rd.interference - 0.00045 * 10); if (rd.interference === 0 && rd.status !== 'OFFLINE') rd.note = rd.status === 'OPERATIONAL' ? 'Nominal' : rd.note }
    if (rd.status === 'MAINTENANCE') {
      if (st.t >= rd.repairUntil) { rd.status = 'OPERATIONAL'; rd.condition = st.rng.range(93, 99); rd.repairTeam = false; st.engineersFree = Math.min(st.engineersTotal, st.engineersFree + 1); rd.note = 'Nominal'; rd.forcedOffline = false; say(st, { channel: 'OPS', from: rd.name.toUpperCase(), to: 'OPS', text: `${rd.name} returned to service.`, voice: 'OPS', ref: rd.id, refKind: 'radar' }) }
      continue
    }
    if (rd.forcedOffline) continue
    if (rd.status === 'OFFLINE' && rd.note === 'Offline at start of watch') continue
    rd.condition = Math.max(0, rd.condition - 0.0016 * 10 * (1 + st.weather.severity))
    if (rd.status === 'OPERATIONAL' && rd.condition < 55) { rd.status = 'DEGRADED'; rd.note = 'Equipment condition poor'; openIncident(st, { kind: 'RADAR_FAULT', title: `${rd.name.toUpperCase()} — DEGRADED`, severity: 2, entityId: null, needs: 'DISPATCH ENGINEERS', deadlineSec: 3600, radarId: rd.id }); say(st, { channel: 'OPS', from: rd.name.toUpperCase(), to: 'OPS', text: `${rd.name}: equipment condition poor, performance degraded.`, voice: 'OPS', sev: 'PRIORITY', ref: rd.id, refKind: 'radar' }) }
    else if (rd.status === 'DEGRADED' && rd.condition < 25) { rd.status = 'OFFLINE'; rd.note = 'Equipment failure'; say(st, { channel: 'OPS', from: rd.name.toUpperCase(), to: 'OPS', text: `${rd.name}: equipment failure, station offline.`, voice: 'OPS', sev: 'URGENT', ref: rd.id, refKind: 'radar' }) }
  }
}
export function eventScheduled(st: GameState, fn: string, args: any[]) {
  if (fn === 'amend') {
    const plan = st.plans[args[0]]; const ac = plan?.aircraftId ? st.aircraft[plan.aircraftId] : null
    if (plan && ac && plan.status === 'ACTIVE') { plan.route = [{ name: 'POS', lat: ac.lat, lon: ac.lon }, { name: 'DEV', lat: args[1], lon: args[2] }, ...ac.nav.wps.slice(1)]; plan.amended = 'AMENDED ' + fmtHM(st.t); plan.remarks += ' [ROUTE AMENDED]' }
  } else if (fn === 'airfieldAck') {
    const nm = AIRPORT_MAP[args[0]]?.name ?? args[0]
    say(st, { channel: 'AIRFIELD', from: nm.toUpperCase(), to: 'OPS', text: `${nm} copy. Emergency services positioned, runway cleared.`, voice: 'AIRFIELD', ref: args[1], refKind: 'incident' })
  }
}

// ---------------- incident lifecycle -------------------------------------------------------
export function monitorIncidents(st: GameState) {
  // detection-triggered incidents
  if (st.pending.length) {
    st.pending = st.pending.filter((p) => {
      const ent = st.aircraft[p.entityId]
      const tr = st.tracks[st.trackByEntity[p.entityId]]
      if (!ent) { if (p.kind !== 'ANOMALY') { st.score.undetected++; say(st, { channel: 'OPS', from: 'WATCH SUPERVISOR', to: 'OPS', text: `Post-event: an unannounced ${p.kind === 'FOREIGN_STATE' ? 'foreign state aircraft' : 'aircraft'} transited our area and was never detected — check radar coverage.`, voice: 'OPS', sev: 'PRIORITY' }) } return false }
      if (tr && !tr.dropped) {
        const inc = openIncident(st, { kind: p.kind, title: p.title, severity: p.severity, entityId: p.entityId, needs: p.needs, deadlineSec: p.deadlineSec })
        say(st, { channel: 'SURV', from: 'RADAR CONTROLLER', to: 'OPS', text: p.announce + ` Track ${tr.id}.`, voice: 'CONTROLLER', sev: p.severity === 3 ? 'URGENT' : 'PRIORITY', ref: tr.id, refKind: 'track' })
        void inc
        return false
      }
      return true
    })
  }
  for (const inc of st.incidents) {
    if (inc.closed !== null) continue
    const ent = inc.entityId ? st.aircraft[inc.entityId] : null
    const tr = inc.entityId ? st.tracks[st.trackByEntity[inc.entityId]] : undefined
    switch (inc.kind) {
      case 'UNKNOWN_CONTACT': case 'STRAYED': case 'ANOMALY': case 'CLONED_ID': case 'MISSING_PLAN': case 'XPDR_FAULT': case 'PLAN_DEVIATION': {
        const classified = !!tr?.manual
        const atc = !!tr?.checks.atc
        const truth = ent?.truth
        if (inc.kind === 'PLAN_DEVIATION' && (atc || (ent && st.plans[ent.planId ?? '']?.amended?.startsWith('AMENDED')))) { if (!inc.acked) ackIncident(st, inc.id); closeIncident(st, inc, 'RESOLVED', atc ? 'Confirmed with ATC — weather deviation' : 'Plan amended'); break }
        if (classified && tr && truth) {
          const m = tr.manual!
          const ok = (m === 'IDENTIFIED' && (truth.legit || truth.intent === 'phenomenon')) || (m === 'SUSPICIOUS' && !truth.legit) || m === 'UNRESOLVED'
          if (m === 'UNRESOLVED') break
          if (!inc.acked) ackIncident(st, inc.id)
          closeIncident(st, inc, ok ? 'RESOLVED' : 'FAILED', ok ? `Classified ${m}` : `Misclassified as ${m}: ${truth.note}`)
          if (!ok) bumpTension(st, 0.04)
          break
        }
        if (!ent) { closeIncident(st, inc, tr?.manual ? 'RESOLVED' : 'FAILED', tr?.manual ? 'Resolved before leaving area' : 'Contact left / landed unresolved'); if (!tr?.manual) bumpTension(st, 0.03); break }
        if (st.t > inc.deadline && !tr?.manual && !inc.log.some((l) => l.includes('overdue'))) { inc.log.push(`${fmtHM(st.t)} Resolution overdue`); st.score.unknownLapse += 0.5 }
        break
      }
      case 'FOREIGN_STATE': {
        const done = !!tr?.vid
        if (!ent) { closeIncident(st, inc, done ? 'RESOLVED' : 'FAILED', done ? 'Identified; aircraft left the area' : 'Left the area without identification'); if (!done) bumpTension(st, 0.05); break }
        if (done && !inc.actioned) { inc.actioned = true; inc.log.push(`${fmtHM(st.t)} Visually identified`) }
        break
      }
      case 'EMERGENCY_7700': {
        if (!ent) { const ok = inc.actioned; closeIncident(st, inc, ok ? 'RESOLVED' : 'FAILED', ok ? 'Landed safely, airfield alerted' : 'Landed without surveillance alerting the airfield'); if (!ok) st.score.emergencyMissed++; break }
        break
      }
      case 'COMMS_7600': { if (!ent) closeIncident(st, inc, 'RESOLVED', inc.acked ? 'Landed/left area' : 'Landed/left area (never acknowledged)'); break }
      case 'UNLAWFUL_7500': {
        if (!ent) { const shadow = Object.values(st.ops).some((o) => o.entityId === inc.entityId && (o.type === 'SHADOW' || o.type === 'MONITOR')); const ok = inc.acked && (shadow || inc.actioned); closeIncident(st, inc, ok ? 'RESOLVED' : 'FAILED', ok ? 'Aircraft landed; incident handed to police' : 'Aircraft landed without adequate surveillance response'); break }
        if (!inc.acked && st.t > inc.opened + 240 && !inc.log.some((l) => l.includes('overdue'))) { inc.log.push(`${fmtHM(st.t)} Acknowledgement overdue`); st.score.unknownLapse += 1 }
        break
      }
      case 'RADAR_FAULT': { const rd = st.radars.find((x) => x.id === inc.radarId); if (rd && rd.status === 'OPERATIONAL') closeIncident(st, inc, 'RESOLVED', `${rd.name} returned to service`); break }
      case 'SAR': { if (st.t > inc.opened + 3000) closeIncident(st, inc, 'RESOLVED', 'SAR flight complete'); break }
    }
  }
}
void planIndex; void label; void ASSET_TYPES

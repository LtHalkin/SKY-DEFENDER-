import { AIRPORT_MAP } from './data/airports'
import { ASSET_TYPES, BASE_SEEDS } from './data/aircraftTypes'
import { distNm, bearingDeg } from './geo'
import { say, rt } from './comms'
import { airfieldWx } from './weather'
import { allocSquawk } from './traffic'
import type { Aircraft, Airfield, Asset, GameState, Readiness } from './types'

export const LAUNCH_DELAY: Record<Readiness, number> = { R5: 120, R30: 300, R60: 600 }
const CALL: Record<string, string> = { F3: 'VIPER', E3D: 'MAGIC', R1: 'RIVET', VC10: 'TARTAN', L1011: 'SHELL', KC135: 'TEXACO', C130: 'ASCOT', CH47: 'CHALK', HAWK: 'TALON', F5E: 'WOLF', L159: 'COBRA', F16: 'FALCON', M2K: 'STORM', F15: 'EAGLE', EF: 'RAZOR' }
export const upg = (st: GameState, k: string) => st.cfg.upgrades?.[k] ?? 0

export function initAirfields(st: GameState) {
  let n = 0
  for (const b of BASE_SEEDS) {
    const ap = AIRPORT_MAP[b.icao]
    const fuelScale = st.cfg.mode === 'INSTANT' ? 0.85 : 1
    st.airfields[b.icao] = { icao: b.icao, name: ap.name, lat: ap.lat, lon: ap.lon, fuelKg: b.fuel * fuelScale, fuelCap: b.cap, spares: b.spares, sparesCap: b.spares * 3, bowsers: b.bowsers + upg(st, 'turnaround'), bowsersBusy: 0, engineers: b.engineers, engineersBusy: 0, open: true, closedReason: '', hasRunwayLength: 8000, alert: null }
    const fleet: [string, number, string][] = st.cfg.fleet ? [] : b.fleet
    for (const [typeId, count, pre] of fleet) {
      const t = ASSET_TYPES[typeId]
      for (let i = 0; i < count; i++) {
        n++
        const id = `AS${String(n).padStart(3, '0')}`
        const tail = `${pre}${100 + st.rng.int(100, 899)}`
        const asset: Asset = {
          id, tail, callsign: `${CALL[typeId]}${i + 1}${b.icao === 'EGQL' || b.icao === 'EGAA' ? 2 : 1}`, typeId, baseId: b.icao, locationId: b.icao, status: 'READY', readiness: typeId === 'F3' && i < 2 ? 'R5' : 'R60',
          fuelKg: t.fuelCap, serviceHrs: st.rng.range(0.3, 1) * t.svcHrs, flightHrs: 0, defect: null, busyUntil: 0, opId: null, ac: null, sorties: 0,
          missiles: t.missiles ? t.missiles + upg(st, 'missiles') : 0, maxMissiles: t.missiles ? t.missiles + upg(st, 'missiles') : 0,
        }
        // a realistic fleet is never entirely serviceable
        if (st.cfg.mode !== 'BASIC' && st.rng.chance(0.12) && i > 0) { asset.status = 'MAINT'; asset.busyUntil = st.t + st.rng.range(1800, 9000); asset.defect = 'Scheduled servicing' }
        st.assets[id] = asset
      }
    }
  }
  if (st.cfg.fleet) {
    const perType: Record<string, number> = {}
    for (const f of st.cfg.fleet) {
      const t = ASSET_TYPES[f.typeId]; if (!t || !st.airfields[f.base]) continue
      const k = (perType[f.typeId] = (perType[f.typeId] ?? 0) + 1)
      const mm = t.missiles ? t.missiles + upg(st, 'missiles') : 0
      st.assets[f.id] = { id: f.id, tail: `ZK${100 + n++}`, callsign: `${CALL[f.typeId] ?? 'BLUE'}${k}${(k * 7) % 10}`, typeId: f.typeId, baseId: f.base, locationId: f.base, status: 'READY', readiness: t.role === 'FIGHTER' ? 'R5' : 'R30', fuelKg: t.fuelCap, serviceHrs: t.svcHrs, flightHrs: 0, defect: null, busyUntil: 0, opId: null, ac: null, sorties: 0, missiles: mm, maxMissiles: mm }
    }
  }
  // make callsigns unique
  const seen = new Set<string>(); let k = 10
  for (const a of Object.values(st.assets)) { while (seen.has(a.callsign)) a.callsign = `${CALL[a.typeId]}${++k}`; seen.add(a.callsign) }
}

export function nearestAirfield(st: GameState, p: { lat: number; lon: number }, opts: { needOpen?: boolean; minFuel?: number; types?: string[]; exclude?: string } = {}): Airfield | null {
  let best: Airfield | null = null, bd = Infinity
  for (const af of Object.values(st.airfields)) {
    if (opts.needOpen !== false && !af.open) continue
    if (opts.exclude && af.icao === opts.exclude) continue
    const d = distNm(p, af); if (d < bd) { bd = d; best = af }
  }
  return best
}
export const assetType = (a: Asset) => ASSET_TYPES[a.typeId]
export const fuelPct = (a: Asset) => a.fuelKg / ASSET_TYPES[a.typeId].fuelCap
export function canLaunch(st: GameState, a: Asset): string | null {
  const t = ASSET_TYPES[a.typeId]
  if (a.status !== 'READY') return `${a.callsign} is ${a.status}`
  const af = a.locationId ? st.airfields[a.locationId] : null
  if (!af) return 'Asset not at an airfield'
  if (!af.open) return `${af.name} closed: ${af.closedReason}`
  if (a.fuelKg < t.fuelCap * 0.55) return `${a.callsign} fuel ${Math.round((a.fuelKg / t.fuelCap) * 100)}% — below launch minimum`
  return null
}

/** Put an asset in the launch queue. The airborne entity is created when the readiness delay elapses. */
export function launchAsset(st: GameState, a: Asset, opId: string | null, expedite = false): string | null {
  const err = canLaunch(st, a); if (err) return err
  a.status = 'LAUNCHING'; a.opId = opId
  a.launchAt = st.t + (expedite ? 60 : LAUNCH_DELAY[a.readiness]) * Math.pow(0.75, upg(st, 'scramble'))
  const af = st.airfields[a.locationId!]
  say(st, { channel: 'AIRFIELD', from: af.name.toUpperCase().replace('RAF ', ''), to: 'OPS', text: `${rt(a.callsign)} — ${ASSET_TYPES[a.typeId].short} state ${a.readiness}, engines starting. Estimated airborne ${Math.round((a.launchAt - st.t) / 60)} minutes.`, voice: 'AIRFIELD', sev: 'ROUTINE', ref: a.id, refKind: 'asset' })
  return null
}
export function spawnAssetAircraft(st: GameState, a: Asset): Aircraft {
  const t = ASSET_TYPES[a.typeId]
  const af = st.airfields[a.locationId!]
  const ap = AIRPORT_MAP[af.icao]
  const ac: Aircraft = {
    id: a.id, kind: 'asset', callsign: a.callsign, reg: a.tail, icao24: 'ASSET', typeId: a.typeId, typeName: t.name, operator: 'Royal Air Force', role: 'MIL',
    lat: af.lat, lon: af.lon, alt: ap.elev, hdg: 0, gs: 80, vs: 0, tgtAlt: t.patrolAlt, tgtSpd: t.cruiseKt,
    nav: { mode: 'HOLD', wps: [], wpi: 0, final: 'NONE', dest: null, orbit: { c: { lat: af.lat, lon: af.lon }, r: 5 } },
    phase: 'DEPARTING', xpdr: { on: true, squawk: allocSquawk(st), modeC: true, modeS: false, msCallsign: a.callsign, msIcao24: 'ASSET', iff4: true, identUntil: 0 },
    planId: null, truth: { intent: 'friendly', legit: true, note: 'Friendly asset', benign: true }, rcs: t.rcs, emitter: t.emitter, spawnedAt: st.t,
    cruiseKt: t.cruiseKt, maxAlt: t.ceiling, climbFpm: t.climbFpm, turnRate: t.turn,
  }
  ac.hdg = 0
  a.ac = ac; a.locationId = null; a.status = 'AIRBORNE'; a.sorties++
  a.launchAt = undefined
  st.aircraft[ac.id] = ac
  af.alert = null
  say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, airborne from ${af.name.replace('RAF ', '')}, ${Math.round((a.fuelKg / 1000) * 10) / 10} tonnes fuel.`, voice: 'PILOT', ref: a.id, refKind: 'asset' })
  return ac
}
export function sendHome(st: GameState, a: Asset, icao?: string, reason = '') {
  if (!a.ac) return
  const af = icao ? st.airfields[icao] : (nearestAirfield(st, a.ac, { needOpen: true, exclude: undefined }) ?? st.airfields[a.baseId])
  const home = st.airfields[a.baseId]
  const dest = icao ? af! : (home?.open && distNm(a.ac, home) < 900 ? home : af!)
  a.ac.nav = { mode: 'LAND', wps: [], wpi: 0, final: 'LAND', dest: dest.icao }
  a.ac.tgtAlt = Math.min(a.ac.alt || 8000, 25000) > 8000 ? Math.min(a.ac.alt, 25000) : 8000
  a.ac.phase = 'ARRIVING'; a.status = 'RETURNING'
  const t = ASSET_TYPES[a.typeId]
  a.ac.nav.speedOverride = t.cruiseKt
  if (reason) say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, ${reason}, returning to ${dest.name.replace('RAF ', '')}.`, voice: 'PILOT', ref: a.id, refKind: 'asset' })
}

export function burnRate(a: Asset): number {
  const t = ASSET_TYPES[a.typeId]; const ac = a.ac!
  const over = Math.max(0, Math.min(1, (ac.gs - t.cruiseKt) / Math.max(1, t.maxKt - t.cruiseKt)))
  let r = t.burnCruise + (t.burnMax - t.burnCruise) * over
  if (ac.alt < 3000 && t.role !== 'HELO') r *= 1.25
  if (ac.vs > 1500) r *= 1.15
  if (ac.gs < t.cruiseKt * 0.85 && ac.alt > 3000) r *= 0.75
  return r / 3600
}
/** Minimum fuel (kg) needed to reach the nearest open airfield plus reserve. */
export function bingoFuel(st: GameState, a: Asset): number {
  const t = ASSET_TYPES[a.typeId]; const ac = a.ac!
  const af = nearestAirfield(st, ac)
  const d = af ? distNm(ac, af) : 150
  return (d / Math.max(t.cruiseKt * 0.9, 90)) * t.burnCruise + t.burnCruise * 0.2 + t.fuelCap * 0.04
}

export function stepAssets(st: GameState, dt: number) {
  for (const a of Object.values(st.assets)) {
    const t = ASSET_TYPES[a.typeId]
    if (a.status === 'LAUNCHING') {
      const af = st.airfields[a.locationId!]
      if (!af.open) { a.status = 'READY'; a.launchAt = undefined; say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} launch cancelled — airfield closed (${af.closedReason}).`, voice: 'AIRFIELD', sev: 'PRIORITY', ref: a.id, refKind: 'asset' }); if (a.opId) st.events.push({ type: 'ui', name: 'launchCancelled:' + a.opId }); continue }
      if (st.t >= (a.launchAt ?? 0)) spawnAssetAircraft(st, a)
    } else if (a.status === 'AIRBORNE' || a.status === 'RETURNING') {
      const ac = a.ac!
      const burn = burnRate(a) * dt
      a.fuelKg = Math.max(0, a.fuelKg - burn)
      a.flightHrs += dt / 3600; a.serviceHrs -= dt / 3600
      if (t.role === 'FIGHTER' && a.fuelKg < t.fuelCap * 0.35 && !a.fuelWarned && a.status === 'AIRBORNE') { a.fuelWarned = true; st.events.push({ type: 'ui', name: 'lowfuel:' + a.id }) }
      if (a.fuelKg < t.fuelCap * 0.2 && !a.lowWarned && a.status === 'AIRBORNE') { a.lowWarned = true; say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, fuel state ${Math.round(a.fuelKg / 100) / 10} tonnes, approaching bingo.`, voice: 'PILOT', sev: 'PRIORITY', ref: a.id, refKind: 'asset' }) }
      const refuelling = !!a.opId && st.ops[a.opId]?.type === 'REFUEL' ? true : Object.values(st.ops).some((o) => o.type === 'REFUEL' && (o.status === 'ACTIVE') && o.assets.includes(a.id) && o.stage >= 2 && o.stage <= 5)
      if (a.status === 'AIRBORNE' && !refuelling && a.fuelKg <= bingoFuel(st, a)) {
        a.bingoWarned = true; st.score.bingoEvents++
        say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, BINGO fuel. Terminating task, returning to base.`, voice: 'PILOT', sev: 'URGENT', ref: a.id, refKind: 'asset' })
        st.events.push({ type: 'alert', text: `${a.callsign} BINGO FUEL`, sev: 2 })
        st.events.push({ type: 'ui', name: 'bingo:' + a.id })
        sendHome(st, a)
      }
      if (a.fuelKg <= 0) {
        // fuel exhaustion: aircraft lost
        a.status = 'US'; a.defect = 'LOST - fuel exhaustion'; delete st.aircraft[ac.id]; a.ac = null
        st.score.incidentsFailed++; st.score.bonus -= 40
        say(st, { channel: 'OPS', from: 'SYSTEM', to: 'ALL', text: `${a.callsign} has been lost — fuel exhaustion. SAR launched.`, voice: 'OPS', sev: 'URGENT', ref: a.id, refKind: 'asset' })
        st.events.push({ type: 'ui', name: 'assetLost:' + a.id })
      }
    }
  }
  // maintenance / turnaround, per airfield resource model
  for (const af of Object.values(st.airfields)) processAirfield(st, af)
}

function startTurnaround(st: GameState, a: Asset, af: Airfield) {
  const t = ASSET_TYPES[a.typeId]
  const need = t.fuelCap - a.fuelKg
  const dur = (1200 + need / 2000 * 60 + (t.role === 'TANKER' ? 900 : 0)) * Math.pow(0.7, upg(st, 'turnaround'))
  af.bowsersBusy++
  a.status = 'TURNAROUND'; a.busyUntil = st.t + dur
}
function processAirfield(st: GameState, af: Airfield) {
  const w = airfieldWx(st.weather, af)
  const wasOpen = af.open
  const fogged = w > 0.93 && st.weather.severity > 0.7
  if (!af.open && af.closedReason.startsWith('WX') && !fogged) { af.open = true; af.closedReason = '' }
  if (fogged && af.open && !af.closedReason) { af.open = false; af.closedReason = 'WX storm cell overhead' }
  if (wasOpen !== af.open) say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: af.open ? `${af.name} reopened.` : `${af.name} closed — ${af.closedReason}.`, voice: 'AIRFIELD', sev: af.open ? 'ROUTINE' : 'PRIORITY', ref: af.icao, refKind: 'airfield' })
  for (const a of Object.values(st.assets)) {
    if (a.locationId !== af.icao) continue
    const t = ASSET_TYPES[a.typeId]
    if (a.status === 'TURNAROUND') {
      if (a.busyUntil === 0) { if (af.bowsersBusy < af.bowsers) startTurnaround(st, a, af) }
      else if (st.t >= a.busyUntil) {
        af.bowsersBusy = Math.max(0, af.bowsersBusy - 1)
        const need = t.fuelCap - a.fuelKg
        const take = Math.min(need, af.fuelKg)
        af.fuelKg -= take; a.fuelKg += take
        a.missiles = a.maxMissiles
        a.lowWarned = false; a.bingoWarned = false; a.fuelWarned = false
        if (a.serviceHrs <= 0) { a.status = 'MAINT'; a.defect = 'Scheduled servicing'; a.busyUntil = 0; continue }
        if (a.fuelKg < t.fuelCap * 0.55 && af.fuelKg <= 1) { a.status = 'READY'; a.defect = 'Low fuel – airfield stocks exhausted'; say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} turnaround complete but only ${Math.round((a.fuelKg / t.fuelCap) * 100)}% fuel — airfield stocks exhausted.`, voice: 'AIRFIELD', sev: 'PRIORITY', ref: a.id, refKind: 'asset' }); continue }
        a.status = 'READY'; if (a.defect === 'Low fuel – airfield stocks exhausted') a.defect = null
        say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} turnaround complete, ${ASSET_TYPES[a.typeId].short} serviceable at state ${a.readiness}.`, voice: 'AIRFIELD', ref: a.id, refKind: 'asset', speak: false })
      }
    } else if (a.status === 'MAINT') {
      if (a.busyUntil === 0) {
        const spares = a.defect === 'Scheduled servicing' ? Math.ceil(t.maintHrs * 3) : Math.ceil(t.maintHrs * 2)
        if (af.engineersBusy < af.engineers && af.spares >= spares) { af.spares -= spares; af.engineersBusy++; a.busyUntil = st.t + t.maintHrs * 3600 * st.rng.range(0.7, 1.4) }
        else if (af.spares < spares) { a.status = 'US'; a.defect = (a.defect ?? 'Defect') + ' — awaiting spares'; st.score.maintLost++; say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} unserviceable awaiting spares. Stock ${af.spares}.`, voice: 'AIRFIELD', sev: 'PRIORITY', ref: a.id, refKind: 'asset' }) }
      } else if (st.t >= a.busyUntil) {
        af.engineersBusy = Math.max(0, af.engineersBusy - 1)
        a.status = 'READY'; a.defect = null; a.serviceHrs = t.svcHrs * st.rng.range(0.85, 1); a.busyUntil = 0
        say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} maintenance complete, returned to service.`, voice: 'AIRFIELD', ref: a.id, refKind: 'asset', speak: false })
      }
    } else if (a.status === 'US' && a.defect && a.defect.includes('awaiting spares')) {
      const need = Math.ceil(t.maintHrs * 2)
      if (af.spares >= need) { a.status = 'MAINT'; a.busyUntil = 0 }
    }
  }
}

/** Called when an asset aircraft touches down. */
export function recoverAsset(st: GameState, a: Asset, icao: string) {
  const ac = a.ac; if (!ac) return
  delete st.aircraft[ac.id]; a.ac = null
  a.locationId = icao; a.status = 'TURNAROUND'; a.busyUntil = 0; a.opId = null
  if (a.cargo) { const af = st.airfields[icao]; { if (a.cargo.kind === 'FUEL') af.fuelKg = Math.min(af.fuelCap, af.fuelKg + a.cargo.qty); else af.spares = Math.min(af.sparesCap, af.spares + a.cargo.qty); say(st, { channel: 'AIRFIELD', from: af.name, to: 'OPS', text: `${a.callsign} landed — ${a.cargo.qty}${a.cargo.kind === 'FUEL' ? ' kg fuel' : ' spares units'} offloaded. ${af.name} stocks now ${a.cargo.kind === 'FUEL' ? Math.round(af.fuelKg / 1000) + ' tonnes' : af.spares + ' units'}.`, voice: 'AIRFIELD', ref: icao, refKind: 'airfield' }) } ; a.cargo = null }
  const t = ASSET_TYPES[a.typeId]
  if (st.rng.chance(Math.min(0.5, 0.02 * (a.flightHrs % 100 + 1) * 0.6 + 0.04))) { a.status = 'MAINT'; a.defect = st.rng.pick(['Hydraulic leak', 'Avionics fault', 'Engine borescope finding', 'Radar fault', 'Undercarriage sensor']); a.busyUntil = 0 }
  const af = st.airfields[icao]
  say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, on the ground at ${af.name.replace('RAF ', '')}, ${Math.round(a.fuelKg / 100) / 10} tonnes remaining.`, voice: 'PILOT', ref: a.id, refKind: 'asset' })
  void t
}
export const headingTo = bearingDeg

/** Fighter speed setting: ECO saves fuel, CRUISE is the type's normal speed, MAX burns fuel fast. */
export function modeSpeed(a: Asset, intercepting = false) {
  const t = ASSET_TYPES[a.typeId], m0 = a.speedMode ?? 'AUTO', m = m0 === 'AUTO' ? (intercepting ? 'MAX' : 'CRUISE') : m0
  return m === 'MAX' ? Math.round(t.maxKt * 0.95) : m === 'ECO' ? Math.round(t.cruiseKt * 0.78) : t.cruiseKt
}
export function applySpeedModes(st: GameState) {
  for (const a of Object.values(st.assets)) {
    if (!a.ac || ASSET_TYPES[a.typeId].role !== 'FIGHTER') continue
    const nav = a.ac.nav, t = ASSET_TYPES[a.typeId], v = modeSpeed(a, nav.mode === 'INTERCEPT')
    if (nav.mode === 'TRAIL') continue
    if (nav.mode === 'INTERCEPT' && nav.targetEntity && st.aircraft[nav.targetEntity] && distNm(a.ac, st.aircraft[nav.targetEntity]) < 4) continue // matching speed for the join
    nav.speedOverride = nav.mode === 'ORBIT' || nav.mode === 'HOLD' ? Math.min(v, Math.round(t.cruiseKt * 0.8)) : v
  }
}

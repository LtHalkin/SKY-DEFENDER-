import { ASSET_TYPES } from './data/aircraftTypes'
import { CIV_TYPES } from './data/aircraftTypes'
import { AIRPORT_MAP } from './data/airports'
import { destPoint, distNm, fmtHM } from './geo'
import { say, rt } from './comms'
import { bingoFuel, canLaunch, launchAsset, nearestAirfield, sendHome, fuelPct } from './assets'
import { resolveFor } from './incidents'
import { label } from './identification'
import { fireMissile, onVisual } from './combat'
import type { Aircraft, Asset, GameState, OpType, Operation } from './types'

export const STAGES: Record<OpType, string[]> = {
  IDENTIFY: ['TASKED', 'LAUNCH', 'TRANSIT', 'INTERCEPT', 'VISUAL ID', 'REPORT', 'RTB', 'COMPLETE'],
  SHADOW: ['TASKED', 'LAUNCH', 'TRANSIT', 'INTERCEPT', 'SHADOWING', 'RTB', 'COMPLETE'],
  MONITOR: ['TASKED', 'LAUNCH', 'TRANSIT', 'ON STATION', 'RTB', 'COMPLETE'],
  PATROL: ['PLANNED', 'LAUNCH', 'TRANSIT', 'ON STATION', 'RTB', 'COMPLETE'],
  RETURN: ['ORDERED', 'TRANSIT', 'LANDING', 'COMPLETE'],
  REFUEL: ['TASKED', 'TANKER LAUNCH', 'RENDEZVOUS', 'CONTACT', 'TRANSFER', 'BREAKAWAY', 'RTB', 'COMPLETE'],
  FERRY: ['TASKED', 'LAUNCH', 'TRANSIT', 'LANDING', 'COMPLETE'],
  SUPPLY: ['TASKED', 'LOADING', 'LAUNCH', 'TRANSIT', 'UNLOAD', 'COMPLETE'],
  ENGAGE: ['TASKED', 'LAUNCH', 'TRANSIT', 'INTERCEPT', 'ENGAGING', 'RTB', 'COMPLETE'],
}
export interface OpSpec {
  type: OpType; trackId?: string; assetId?: string; tankerId?: string; point?: { lat: number; lon: number }; radius?: number; durationMin?: number
  startDelayMin?: number; toBase?: string; cargo?: { kind: 'FUEL' | 'SPARES'; qty: number }; autoRelief?: boolean; expedite?: boolean
}
const ROLE_OK: Record<OpType, string[]> = {
  IDENTIFY: ['FIGHTER'], SHADOW: ['FIGHTER'], MONITOR: ['AEW', 'ELINT', 'FIGHTER'], PATROL: ['FIGHTER', 'AEW', 'ELINT', 'HELO', 'TANKER'], RETURN: [], REFUEL: ['TANKER'], FERRY: ['FIGHTER', 'AEW', 'ELINT', 'TANKER', 'TRANSPORT', 'HELO'], SUPPLY: ['TRANSPORT', 'HELO'], ENGAGE: ['FIGHTER'],
}
const log = (st: GameState, op: Operation, m: string) => { op.log.push(`${fmtHM(st.t)} ${m}`); op.updated = st.t }
function setStage(st: GameState, op: Operation, s: number, m?: string) { op.stage = s; op.stageSince = st.t; log(st, op, m ?? STAGES[op.type][s]) }
const A = (st: GameState, op: Operation, i = 0): Asset | undefined => st.assets[op.assets[i]]
const entity = (st: GameState, op: Operation): Aircraft | undefined => (op.entityId ? st.aircraft[op.entityId] : undefined)

function isNight(st: GameState) { const h = (st.t / 3600) % 24; return h < 5.5 || h > 20.5 }
export function visRange(st: GameState) { const v = Math.min(st.weather.visibilityKm / 4, 2.2); return Math.max(0.5, v * (isNight(st) ? 0.6 : 1)) }

function pickAsset(st: GameState, roles: string[], from: { lat: number; lon: number }, allowAirborne = true, only?: Asset[]): Asset | null {
  let best: Asset | null = null, bt = Infinity
  for (const a of only ?? Object.values(st.assets)) {
    const t = ASSET_TYPES[a.typeId]; if (!roles.includes(t.role)) continue
    if (a.opId && st.ops[a.opId] && (st.ops[a.opId].status === 'ACTIVE' || st.ops[a.opId].status === 'PLANNED')) continue
    let eta: number
    if (a.status === 'READY' && !canLaunch(st, a)) { const af = st.airfields[a.locationId!]; eta = (distNm(af, from) / t.cruiseKt) * 3600 + { R5: 120, R30: 300, R60: 600 }[a.readiness] }
    else if (allowAirborne && a.status === 'AIRBORNE' && a.ac && !a.opId && fuelPct(a) > 0.4) eta = (distNm(a.ac, from) / t.cruiseKt) * 3600
    else continue
    if (eta < bt) { bt = eta; best = a }
  }
  return best
}
export function opLabel(st: GameState, op: Operation) {
  const tr = op.trackId ? st.tracks[op.trackId] : undefined
  const tgt = tr ? label(st, tr) : op.point ? 'AREA' : ''
  return `${op.type}${tgt ? ' ' + tgt : ''}`
}

export function createOp(st: GameState, spec: OpSpec): { ok: true; id: string } | { ok: false; error: string } {
  const type = spec.type
  const tr = spec.trackId ? st.tracks[spec.trackId] : undefined
  const op: Operation = { id: `OP${String(Object.keys(st.ops).length + 1).padStart(3, '0')}`, type, status: 'ACTIVE', stages: STAGES[type], stage: 0, assets: [], created: st.t, updated: st.t, log: [], result: '', stageSince: st.t, data: {} }
  let asset: Asset | undefined
  const needTrack = type === 'IDENTIFY' || type === 'SHADOW' || type === 'MONITOR' || type === 'ENGAGE'
  if (needTrack) {
    if (!tr || tr.dropped) return { ok: false, error: 'Select a live track for this operation' }
    if (!st.aircraft[tr.entityId]) return { ok: false, error: 'Target no longer airborne' }
    op.trackId = tr.id; op.entityId = tr.entityId
    if (Object.values(st.ops).some((o) => o.type === type && o.trackId === tr.id && (o.status === 'ACTIVE' || o.status === 'PLANNED') && type !== 'SHADOW')) return { ok: false, error: `${type} already active on ${tr.id}` }
  }
  if (spec.assetId) { asset = st.assets[spec.assetId]; if (!asset) return { ok: false, error: 'Unknown asset' } }
  const pos = tr ?? spec.point ?? { lat: 54.5, lon: -4 }
  if (type === 'ENGAGE') {
    if (!tr!.hostile) return { ok: false, error: 'Weapons tight — target has not been declared hostile (identify it, or warn it and see if it complies)' }
    // prefer a jet already on this target with missiles
    if (!asset) asset = Object.values(st.assets).find((a) => a.ac && a.missiles > 0 && a.opId && st.ops[a.opId]?.entityId === tr!.entityId) ?? undefined
    if (asset?.opId && st.ops[asset.opId] && st.ops[asset.opId].entityId === tr!.entityId && st.ops[asset.opId].type !== 'ENGAGE') endOp(st, st.ops[asset.opId], 'COMPLETE', 'Handed over to ENGAGE', false)
    if (!asset) { const cands = Object.values(st.assets).filter((a) => a.missiles > 0); asset = pickAsset(st, ['FIGHTER'], pos, true, cands) ?? undefined }
    if (asset && asset.missiles <= 0) return { ok: false, error: `${asset.callsign} has no missiles left` }
    if (asset && asset.status === 'RETURNING' && asset.ac && asset.fuelKg > bingoFuel(st, asset) * 1.3) asset.status = 'AIRBORNE'
  }
  if (type === 'IDENTIFY' || type === 'SHADOW') { asset ??= pickAsset(st, ROLE_OK[type], pos) ?? undefined }
  else if (type === 'MONITOR') asset ??= pickAsset(st, ['AEW', 'ELINT'], pos) ?? pickAsset(st, ['FIGHTER'], pos) ?? undefined
  else if (type === 'PATROL') { if (!spec.point) return { ok: false, error: 'Patrol needs a map point' }; asset ??= pickAsset(st, ['FIGHTER'], pos) ?? undefined }
  if (type === 'RETURN') {
    const a = asset; if (!a || !a.ac) return { ok: false, error: 'Select an airborne asset' }
    if (spec.toBase && !st.airfields[spec.toBase]) return { ok: false, error: 'Unknown airfield' }
    cancelOpsFor(st, a, 'Asset recalled to base')
    op.assets = [a.id]; op.toBase = spec.toBase
    sendHome(st, a, spec.toBase)
    a.opId = op.id; setStage(st, op, 1, `Recalled ${a.callsign}`)
    st.ops[op.id] = op; return { ok: true, id: op.id }
  }
  if (type === 'REFUEL') {
    const tanker = spec.tankerId ? st.assets[spec.tankerId] : pickAsset(st, ['TANKER'], spec.point ?? asset?.ac ?? { lat: 54, lon: -3 })
    const recv = asset
    if (!tanker || ASSET_TYPES[tanker.typeId].role !== 'TANKER') return { ok: false, error: 'No tanker available' }
    if (!recv || !recv.ac) return { ok: false, error: 'Select an airborne receiver' }
    if (ASSET_TYPES[recv.typeId].role === 'TANKER' || ASSET_TYPES[recv.typeId].role === 'HELO') return { ok: false, error: 'Receiver cannot take fuel in flight' }
    if (tanker.status === 'READY') { const e = canLaunch(st, tanker); if (e) return { ok: false, error: e } }
    else if (!(tanker.status === 'AIRBORNE' && tanker.ac && !tanker.opId)) return { ok: false, error: `${tanker.callsign} is ${tanker.status}${tanker.opId ? ' on ' + tanker.opId : ''}` }
    op.assets = [tanker.id, recv.id]
    op.point = spec.point ?? { lat: (recv.ac.lat + (st.airfields[tanker.locationId ?? tanker.baseId]?.lat ?? recv.ac.lat)) / 2, lon: (recv.ac.lon + (st.airfields[tanker.locationId ?? tanker.baseId]?.lon ?? recv.ac.lon)) / 2 }
    op.refuelFor = recv.id
    tanker.opId = op.id
    st.ops[op.id] = op; log(st, op, `Tasked ${tanker.callsign} to refuel ${recv.callsign}`)
    return { ok: true, id: op.id }
  }
  if (!asset) return { ok: false, error: 'No suitable serviceable asset available' }
  const t = ASSET_TYPES[asset.typeId]
  if (!ROLE_OK[type].includes(t.role)) return { ok: false, error: `${t.short} cannot perform ${type}` }
  if (asset.opId && st.ops[asset.opId] && st.ops[asset.opId].status === 'ACTIVE') return { ok: false, error: `${asset.callsign} is tasked on ${asset.opId}` }
  if (asset.status === 'READY') { const e = canLaunch(st, asset); if (e) return { ok: false, error: e } }
  else if (!(asset.status === 'AIRBORNE' && asset.ac)) return { ok: false, error: `${asset.callsign} is ${asset.status}` }
  op.assets = [asset.id]
  if (type === 'PATROL') { op.point = spec.point; op.radius = spec.radius ?? 18; op.durationMin = spec.durationMin ?? 60; op.data.autoRelief = !!spec.autoRelief }
  if (type === 'MONITOR' || type === 'SHADOW') op.durationMin = spec.durationMin ?? (type === 'MONITOR' ? 45 : 60)
  if (type === 'FERRY') {
    if (!spec.toBase || !st.airfields[spec.toBase]) return { ok: false, error: 'Select destination airfield' }
    if (asset.locationId === spec.toBase) return { ok: false, error: 'Asset already at destination' }
    const from = asset.ac ?? st.airfields[asset.locationId!]
    const need = (distNm(from, st.airfields[spec.toBase]) / t.cruiseKt) * t.burnCruise * 1.2
    if (asset.fuelKg < need) return { ok: false, error: `Insufficient fuel for ferry (${Math.round(need)} kg required)` }
    op.toBase = spec.toBase
  }
  if (type === 'SUPPLY') {
    const af = asset.locationId ? st.airfields[asset.locationId] : null
    if (!af) return { ok: false, error: 'Transport must be on the ground at the source airfield' }
    if (!spec.toBase || !st.airfields[spec.toBase] || spec.toBase === af.icao) return { ok: false, error: 'Select a different destination airfield' }
    const c = spec.cargo ?? { kind: 'FUEL' as const, qty: 10000 }
    const cap = c.kind === 'FUEL' ? t.cargo : Math.floor(t.cargo / 100)
    const avail = c.kind === 'FUEL' ? Math.max(0, af.fuelKg - af.fuelCap * 0.08) : Math.max(0, af.spares - 4)
    const qty = Math.floor(Math.min(c.qty, cap, avail))
    if (qty <= 0) return { ok: false, error: `${af.name} cannot spare any ${c.kind.toLowerCase()}` }
    op.fromBase = af.icao; op.toBase = spec.toBase; op.cargo = { kind: c.kind, qty }
    if (c.kind === 'FUEL') af.fuelKg -= qty; else af.spares -= qty
    asset.cargo = { kind: c.kind, qty, to: spec.toBase }
  }
  asset.opId = op.id
  st.ops[op.id] = op
  if (type === 'PATROL' && (spec.startDelayMin ?? 0) > 0) { op.status = 'PLANNED'; op.data.startAt = st.t + (spec.startDelayMin as number) * 60; log(st, op, `Scheduled to start ${fmtHM(op.data.startAt as number)}`) }
  else log(st, op, `Tasked ${asset.callsign} (${t.short})`)
  op.data.expedite = !!spec.expedite
  if (type !== 'SUPPLY' && op.status === 'ACTIVE') { /* launch happens in stage 0 handler */ }
  return { ok: true, id: op.id }
}
function cancelOpsFor(st: GameState, a: Asset, why: string) {
  for (const o of Object.values(st.ops)) if ((o.status === 'ACTIVE' || o.status === 'PLANNED') && o.assets.includes(a.id) && o.type !== 'RETURN') endOp(st, o, 'ABORTED', why, false)
}
function endOp(st: GameState, op: Operation, status: 'COMPLETE' | 'ABORTED' | 'FAILED', result: string, recall = true) {
  if (op.status === 'COMPLETE' || op.status === 'ABORTED' || op.status === 'FAILED') return
  op.status = status; op.result = result; op.updated = st.t
  if (status === 'COMPLETE') { op.stage = op.stages.length - 1; st.score.opsCompleted++ } else if (status === 'ABORTED') st.score.opsAborted++; else st.score.opsFailed++
  log(st, op, `${status}: ${result}`)
  for (const id of op.assets) {
    const a = st.assets[id]; if (!a) continue
    if (a.opId === op.id) a.opId = null
    a.hold = false
    if (recall && a.ac && a.status === 'AIRBORNE') sendHome(st, a)
    if (a.status === 'LAUNCHING') { a.status = 'READY'; a.launchAt = undefined }
    if (a.status === 'READY' && a.cargo && a.locationId && op.type === 'SUPPLY') { const af = st.airfields[a.locationId]; if (a.cargo.kind === 'FUEL') af.fuelKg += a.cargo.qty; else af.spares += a.cargo.qty; a.cargo = null }
  }
}
export function abortOp(st: GameState, id: string) {
  const op = st.ops[id]; if (!op) return
  const wasLaunching = op.assets.map((x) => st.assets[x]).some((a) => a?.status === 'LAUNCHING')
  endOp(st, op, 'ABORTED', wasLaunching ? 'Aborted before launch' : 'Aborted by operator')
  say(st, { channel: 'OPS', from: 'OPS', to: op.assets.map((x) => st.assets[x]?.callsign).join(', '), text: `${op.type} ${op.id} cancelled by operations.`, voice: 'OPS', ref: op.id, refKind: 'op', speak: false })
}

// -------- per-tick state machines ---------------------------------------------------------
const landed = (a: Asset) => !a.ac && a.locationId !== null
function holdOrbit(a: Asset, c: { lat: number; lon: number }, r: number, alt?: number) {
  const ac = a.ac!; const t = ASSET_TYPES[a.typeId]
  ac.nav = { mode: 'ORBIT', wps: [], wpi: 0, final: 'NONE', dest: null, orbit: { c, r }, speedOverride: Math.round(t.cruiseKt * 0.78) }
  if (alt) ac.tgtAlt = Math.min(alt, t.ceiling)
}
function intercept(a: Asset, ent: Aircraft, known: { lat: number; lon: number }, live: boolean, d: number) {
  const ac = a.ac!; const t = ASSET_TYPES[a.typeId]
  const spd = d > 60 ? t.maxKt * 0.92 : Math.min(t.maxKt * 0.9, Math.max(ent.gs + 90, 250))
  ac.nav = { mode: 'INTERCEPT', wps: [{ name: 'TGT', lat: known.lat, lon: known.lon }], wpi: 0, final: 'NONE', dest: null, targetEntity: live ? ent.id : undefined, speedOverride: d < 3 ? Math.max(ent.gs + 25, 140) : spd }
}
function knownPos(st: GameState, op: Operation, a: Asset, ent: Aircraft): { pos: { lat: number; lon: number }; live: boolean; lost: boolean } {
  const ac = a.ac!; const t = ASSET_TYPES[a.typeId]
  const d = distNm(ac, ent)
  const tr = op.trackId ? st.tracks[op.trackId] : undefined
  if (t.radar > 0 && d < t.radar && Math.abs(ent.alt - ac.alt) < 40000) return { pos: ent, live: true, lost: false }
  if (t.role === 'AEW' || t.role === 'ELINT') return { pos: tr && !tr.dropped ? tr : ent, live: false, lost: false }
  if (tr && !tr.dropped) {
    const age = st.t - tr.lastPlot
    return { pos: age > 3 && tr.gs > 20 ? destPoint(tr, tr.hdg, (tr.gs / 3600) * age) : tr, live: false, lost: false }
  }
  // no track and no radar: working from last known
  const lastAge = tr ? st.t - tr.lastPlot : 999
  if (tr && lastAge < 240) return { pos: destPoint(tr, tr.hdg, (tr.gs / 3600) * lastAge), live: false, lost: false }
  return { pos: tr ?? ent, live: false, lost: true }
}
function ensureLaunch(st: GameState, op: Operation, a: Asset): 'wait' | 'airborne' | 'fail' {
  if (a.ac) return 'airborne'
  if (a.status === 'READY') { const e = launchAsset(st, a, op.id, !!op.data.expedite); if (e) { endOp(st, op, 'FAILED', e); return 'fail' } ; log(st, op, `${a.callsign} scrambling (${a.readiness})`); return 'wait' }
  if (a.status === 'LAUNCHING') return 'wait'
  endOp(st, op, 'FAILED', `${a.callsign} unavailable (${a.status})`); return 'fail'
}

function visualId(st: GameState, op: Operation, a: Asset, ent: Aircraft) {
  const tr = op.trackId ? st.tracks[op.trackId] : undefined
  const t = ent.truth
  const tn = ent.typeName
  let text: string
  switch (t.intent) {
    case 'foreignState': text = `${tn}, foreign state markings, straight and level. No response to R/T on guard.`; break
    case 'cloned': text = `${tn} in private colours, registration ${ent.reg} — NOT the callsign being transmitted. No R/T reply.`; break
    case 'unlawful': text = `${tn}, ${ent.operator} colours. Aircraft maintaining level flight, no response to R/T, no external abnormalities.`; break
    case 'phenomenon': text = ent.typeId === 'BALN' ? 'No aircraft. Meteorological balloon with radar reflector.' : ent.typeId === 'FLOK' ? 'No aircraft. Large flock of birds.' : 'No visual contact. Nothing at the position.'; break
    case 'strayed': text = `${tn} ${ent.reg}, pilot responding on 121.5, uncertain of position, requests vectors.`; break
    case 'commsFail': text = `${tn} ${ent.callsign} normal in all respects, crew acknowledging by wing rock. Appears NORDO.`; break
    case 'emergency': text = `${tn} ${ent.callsign}, ${ent.operator}; crew confirm emergency and are diverting.`; break
    case 'noPlan': text = `${tn} ${ent.callsign} ${ent.reg}, ${ent.operator}. Crew responding, confirm flight plan filed with area.`; break
    default: text = `${tn} ${ent.callsign} ${ent.reg}, ${ent.operator}. Crew responding normally.`
  }
  if (t.intent === 'hostile') text = `${tn}, hostile markings, ignoring all calls. Weapons free on your authority.`
  onVisual(st, ent, tr)
  if (tr) {
    tr.vid = { t: st.t, text, byAsset: a.callsign, ok: true }
    if (!tr.scored) { tr.scored = true; st.score.idCorrect++ }
    tr.manual = 'IDENTIFIED'; tr.idBy = 'VID'; tr.idAt = st.t; tr.flagsAtId = [...tr.flags]; tr.unknownSince = null
    tr.log.push(`${st.t}|Visual ID by ${a.callsign}`)
  }
  if (t.intent === 'foreignState' || t.intent === 'unlawful') st.events.push({ type: 'alert', text: `VID: ${text.slice(0, 60)}`, sev: 2 })
  say(st, { channel: 'PILOT', from: a.callsign, to: 'OPS', text: `${rt(a.callsign)}, tally. ${text}`, voice: 'PILOT', sev: 'PRIORITY', ref: tr?.id ?? a.id, refKind: tr ? 'track' : 'asset' })
  resolveFor(st, ent.id, ['UNKNOWN_CONTACT', 'STRAYED', 'ANOMALY', 'MISSING_PLAN', 'CLONED_ID', 'XPDR_FAULT'], `Visual identification: ${text}`)
}

export function stepOps(st: GameState, _dt: number) {
  for (const op of Object.values(st.ops)) {
    if (op.status !== 'ACTIVE' && op.status !== 'PLANNED') continue
    switch (op.type) {
      case 'IDENTIFY': case 'SHADOW': stepChase(st, op); break
      case 'MONITOR': stepMonitor(st, op); break
      case 'PATROL': stepPatrol(st, op); break
      case 'RETURN': stepReturn(st, op); break
      case 'REFUEL': stepRefuel(st, op); break
      case 'FERRY': stepFerry(st, op); break
      case 'SUPPLY': stepSupply(st, op); break
      case 'ENGAGE': stepEngage(st, op); break
    }
  }
}
function opAssetGone(st: GameState, op: Operation, a: Asset | undefined): boolean {
  if (!a) { endOp(st, op, 'FAILED', 'Asset missing'); return true }
  if (a.defect?.startsWith('LOST')) { endOp(st, op, 'FAILED', `${a.callsign} lost`); return true }
  return false
}
function rtbWait(st: GameState, op: Operation, a: Asset, doneStatus: 'COMPLETE' | 'ABORTED' = 'COMPLETE', msg = 'Aircraft recovered') {
  if (landed(a)) { endOp(st, op, doneStatus, msg, false); return true }
  if (a.status === 'AIRBORNE' && a.ac && a.ac.nav.mode !== 'LAND') sendHome(st, a)
  return false
}
function stepChase(st: GameState, op: Operation) {
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const ent = entity(st, op)
  const tr = op.trackId ? st.tracks[op.trackId] : undefined
  const RTB = op.type === 'IDENTIFY' ? 6 : 5
  const goRtb = (why: string) => { setStage(st, op, RTB, why); sendHome(st, asset) }
  if (op.stage >= RTB) { rtbWait(st, op, asset); return }
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, asset); if (r === 'airborne') setStage(st, op, 2, `${asset.callsign} airborne, vectoring to ${tr ? tr.id : 'target'}`); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (asset.ac) setStage(st, op, 2, `${asset.callsign} airborne, vectoring to ${tr ? tr.id : 'target'}`); else if (asset.status === 'READY') endOp(st, op, 'FAILED', 'Launch cancelled'); break
    case 2: case 3: {
      if (!asset.ac) { if (asset.status === 'RETURNING' || landed(asset)) endOp(st, op, 'FAILED', 'Asset recovered before intercept'); break }
      if (asset.status === 'RETURNING') { endOp(st, op, 'FAILED', 'Bingo fuel before intercept', false); break }
      if (!ent) { goRtb('Target no longer airborne — RTB'); break }
      const k = knownPos(st, op, asset, ent)
      const d = distNm(asset.ac, k.pos)
      if (k.lost && st.t - op.stageSince > 360) { endOp(st, op, 'FAILED', 'Contact lost — no radar coverage on target'); say(st, { channel: 'PILOT', from: asset.callsign, to: 'OPS', text: `${rt(asset.callsign)}, no contact, target lost. Returning.`, voice: 'PILOT', sev: 'PRIORITY', ref: op.id, refKind: 'op' }); break }
      const dTrue = distNm(asset.ac, ent)
      const reach = k.live ? dTrue : d
      asset.ac.tgtAlt = Math.max(1500, Math.min(ASSET_TYPES[asset.typeId].ceiling, (tr?.alt ?? ent.alt) - (k.live ? 300 : 0)))
      intercept(asset, ent, k.pos, k.live, reach)
      if (op.stage === 2 && k.live && dTrue < 14) { setStage(st, op, 3, `${asset.callsign} radar contact, closing`); say(st, { channel: 'PILOT', from: asset.callsign, to: 'OPS', text: `${rt(asset.callsign)}, contact, ${Math.round(dTrue)} miles.`, voice: 'PILOT', ref: op.id, refKind: 'op' }) }
      if (op.stage === 3 && !k.live && dTrue > 30) setStage(st, op, 2, 'Contact lost, reacquiring')
      if (op.stage === 3 && dTrue <= visRange(st)) {
        if (op.type === 'IDENTIFY') setStage(st, op, 4, 'Visual identification in progress')
        else {
          if (!tr?.vid) visualId(st, op, asset, ent)
          op.endsAt = st.t + (op.durationMin ?? 60) * 60
          for (const o of Object.values(st.ops)) if (o !== op && o.type === 'SHADOW' && o.status === 'ACTIVE' && o.entityId === op.entityId && o.stage === 4) endOp(st, o, 'COMPLETE', `Relieved by ${asset.callsign}`)
          setStage(st, op, 4, `${asset.callsign} established shadow at 3NM`)
        }
      }
      break
    }
    case 4: {
      if (!asset.ac) { if (landed(asset)) endOp(st, op, 'COMPLETE', 'Ended', false); break }
      if (!ent) { goRtb('Target no longer airborne — RTB'); break }
      if (op.type === 'IDENTIFY') {
        asset.ac.nav = { mode: 'TRAIL', wps: [], wpi: 0, final: 'NONE', dest: null, targetEntity: ent.id, trailNm: 0.4 }
        asset.ac.tgtAlt = ent.alt + 100
        if (st.t - op.stageSince >= 18) {
          visualId(st, op, asset, ent)
          if (ent.truth.intent === 'hostile') { endOp(st, op, 'COMPLETE', 'Hostile identified — escorting', false); createOp(st, { type: 'SHADOW', trackId: op.trackId, assetId: asset.id, durationMin: 60 }); break }
          setStage(st, op, 5, 'Identification reported')
        }
      } else {
        asset.ac.nav = { mode: 'TRAIL', wps: [], wpi: 0, final: 'NONE', dest: null, targetEntity: ent.id, trailNm: 3 }
        asset.ac.tgtAlt = Math.max(1500, ent.alt + 500)
        if (asset.status === 'RETURNING') { endOp(st, op, 'ABORTED', 'Shadow broken — bingo fuel, relief required', false); say(st, { channel: 'OPS', from: 'OPS', to: 'WATCH', text: `Shadow of ${tr ? label(st, tr) : 'target'} broken: ${asset.callsign} bingo. Relief required.`, voice: 'OPS', sev: 'URGENT', ref: op.id, refKind: 'op' }); break }
        if (op.endsAt && st.t > op.endsAt) goRtb('Shadow duration elapsed — RTB')
      }
      break
    }
    case 5: if (st.t - op.stageSince >= 6) goRtb('RTB'); break
  }
}
function stepMonitor(st: GameState, op: Operation) {
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const ent = entity(st, op), tr = op.trackId ? st.tracks[op.trackId] : undefined
  const t = ASSET_TYPES[asset.typeId]
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, asset); if (r === 'airborne') setStage(st, op, 2); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (asset.ac) setStage(st, op, 2); break
    case 2: {
      if (!asset.ac) break
      if (!ent) { setStage(st, op, 4, 'Target gone — RTB'); sendHome(st, asset); break }
      const p = tr && !tr.dropped ? tr : ent
      asset.ac.nav = { mode: 'GOTO', wps: [{ name: 'MON', lat: p.lat, lon: p.lon }], wpi: 0, final: 'NONE', dest: null, speedOverride: t.cruiseKt }
      asset.ac.tgtAlt = t.patrolAlt
      if (distNm(asset.ac, p) < (t.role === 'AEW' ? 80 : t.role === 'ELINT' ? 70 : 25)) { setStage(st, op, 3, `${asset.callsign} on station`); op.endsAt = st.t + (op.durationMin ?? 45) * 60; say(st, { channel: 'PILOT', from: asset.callsign, to: 'OPS', text: `${rt(asset.callsign)}, on station, monitoring ${tr ? label(st, tr) : 'target'}.`, voice: 'PILOT', ref: op.id, refKind: 'op' }) }
      break
    }
    case 3: {
      if (!asset.ac) { if (landed(asset)) endOp(st, op, 'COMPLETE', 'Monitoring ended'); break }
      if (!ent) { setStage(st, op, 4, 'Target no longer airborne — RTB'); sendHome(st, asset); break }
      const r = t.role === 'AEW' ? 40 : t.role === 'ELINT' ? 38 : 15
      const o = asset.ac.nav.orbit
      if (asset.ac.nav.mode !== 'ORBIT' || !o || distNm(o.c, ent) > r * 0.8) holdOrbit(asset, { lat: ent.lat, lon: ent.lon }, r, t.patrolAlt)
      if (asset.status === 'RETURNING') { endOp(st, op, 'ABORTED', 'Bingo fuel — monitoring terminated', false); break }
      if (op.endsAt && st.t > op.endsAt) { setStage(st, op, 4, 'Monitoring period complete — RTB'); sendHome(st, asset) }
      break
    }
    default: rtbWait(st, op, asset)
  }
}
function stepPatrol(st: GameState, op: Operation) {
  if (op.status === 'PLANNED') { if (st.t >= (op.data.startAt as number)) { op.status = 'ACTIVE'; log(st, op, 'Schedule reached — activating'); setStage(st, op, 0) } return }
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const t = ASSET_TYPES[asset.typeId]
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, asset); if (r === 'airborne') setStage(st, op, 2); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (asset.ac) setStage(st, op, 2); break
    case 2: {
      if (!asset.ac) break
      asset.ac.nav = { mode: 'GOTO', wps: [{ name: 'PATROL', ...op.point! }], wpi: 0, final: 'NONE', dest: null, speedOverride: Math.round((t.cruiseKt + t.maxKt) / 2) }
      asset.ac.tgtAlt = t.patrolAlt
      if (distNm(asset.ac, op.point!) < 6) { setStage(st, op, 3, `${asset.callsign} on patrol station`); op.endsAt = st.t + (op.durationMin ?? 60) * 60 }
      break
    }
    case 3: {
      if (!asset.ac) { if (landed(asset)) endOp(st, op, 'COMPLETE', 'Patrol ended'); break }
      if (asset.ac.nav.mode !== 'ORBIT') holdOrbit(asset, op.point!, op.radius ?? 18, t.patrolAlt)
      if (asset.status === 'RETURNING') {
        if (op.data.autoRelief) { const rel = pickAsset(st, [t.role], op.point!, false); if (rel) { const r = createOp(st, { type: 'PATROL', point: op.point!, radius: op.radius, durationMin: Math.max(15, Math.round(((op.endsAt ?? st.t) - st.t) / 60)), assetId: rel.id, autoRelief: true, expedite: true }); if (r.ok) log(st, op, `Relief ${rel.callsign} tasked (${r.id})`) } }
        endOp(st, op, 'ABORTED', 'Bingo fuel — patrol terminated', false); break
      }
      if (op.endsAt && st.t > op.endsAt) { setStage(st, op, 4, 'Patrol period complete — RTB'); sendHome(st, asset) }
      break
    }
    default: rtbWait(st, op, asset)
  }
}
function stepReturn(st: GameState, op: Operation) {
  const a = A(st, op); if (!a) return
  if (landed(a)) { endOp(st, op, 'COMPLETE', `Recovered at ${a.locationId}`, false); return }
  if (a.ac && a.ac.nav.mode === 'LAND' && op.stage < 2 && a.ac.nav.dest && distNm(a.ac, AIRPORT_MAP[a.ac.nav.dest]) < 30) setStage(st, op, 2)
}
function stepFerry(st: GameState, op: Operation) {
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const t = ASSET_TYPES[asset.typeId]
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, asset); if (r === 'airborne') setStage(st, op, 2); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (asset.ac) setStage(st, op, 2); break
    case 2: case 3: {
      if (!asset.ac) { if (landed(asset)) { if (asset.locationId === op.toBase) { asset.baseId = op.toBase!; endOp(st, op, 'COMPLETE', `${asset.callsign} re-based to ${op.toBase}`, false) } else endOp(st, op, 'FAILED', `Diverted to ${asset.locationId}`, false) } break }
      if (asset.status === 'RETURNING' && asset.ac.nav.dest !== op.toBase) { endOp(st, op, 'FAILED', 'Bingo — diverted', false); break }
      if (asset.ac.nav.mode !== 'LAND') { asset.ac.nav = { mode: 'LAND', wps: [], wpi: 0, final: 'LAND', dest: op.toBase!, speedOverride: t.cruiseKt }; asset.ac.tgtAlt = Math.min(t.patrolAlt, 24000) }
      const d = distNm(asset.ac, st.airfields[op.toBase!])
      if (op.stage === 2 && d < 40) setStage(st, op, 3)
      break
    }
  }
}
function stepSupply(st: GameState, op: Operation) {
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const t = ASSET_TYPES[asset.typeId]
  switch (op.stage) {
    case 0: setStage(st, op, 1, `Loading ${op.cargo!.qty}${op.cargo!.kind === 'FUEL' ? ' kg fuel' : ' spares'} at ${op.fromBase}`); break
    case 1: if (st.t - op.stageSince > 600) { const r = ensureLaunch(st, op, asset); if (r === 'wait') setStage(st, op, 2); else if (r === 'airborne') setStage(st, op, 3) } break
    case 2: if (asset.ac) setStage(st, op, 3); break
    case 3: {
      if (!asset.ac) { if (landed(asset)) setStage(st, op, 4, `Unloading at ${asset.locationId}`); break }
      if (asset.ac.nav.mode !== 'LAND') { asset.ac.nav = { mode: 'LAND', wps: [], wpi: 0, final: 'LAND', dest: op.toBase!, speedOverride: t.cruiseKt }; asset.ac.tgtAlt = Math.min(t.patrolAlt, 18000) }
      break
    }
    case 4: endOp(st, op, 'COMPLETE', `Delivered ${op.cargo!.qty}${op.cargo!.kind === 'FUEL' ? ' kg fuel' : ' spares'} to ${asset.locationId}`, false); break
  }
}
function stepRefuel(st: GameState, op: Operation) {
  const tk = A(st, op, 0), rv = A(st, op, 1)
  if (!tk || !rv) { endOp(st, op, 'FAILED', 'Asset missing'); return }
  const tt = ASSET_TYPES[tk.typeId], rt2 = ASSET_TYPES[rv.typeId]
  const rvPoint = op.point!
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, tk); if (r === 'airborne') setStage(st, op, 2, `${tk.callsign} airborne, proceeding to rendezvous`); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (tk.ac) setStage(st, op, 2, `${tk.callsign} airborne, proceeding to rendezvous`); break
    case 2: {
      if (!tk.ac) break
      if (!rv.ac) { endOp(st, op, 'FAILED', 'Receiver no longer airborne'); break }
      if (tk.fuelKg - tt.fuelCap * 0.2 < 4000) { endOp(st, op, 'FAILED', 'Tanker has insufficient transferable fuel'); break }
      rv.hold = true; if (rv.status === 'RETURNING') rv.status = 'AIRBORNE'
      const rvAlt = Math.min(24000, rt2.ceiling)
      if (distNm(tk.ac, rvPoint) > 8 && tk.ac.nav.mode !== 'ORBIT') { tk.ac.nav = { mode: 'GOTO', wps: [{ name: 'RV', ...rvPoint }], wpi: 0, final: 'NONE', dest: null, speedOverride: tt.cruiseKt }; tk.ac.tgtAlt = rvAlt + 1000 }
      if (distNm(tk.ac, rvPoint) <= 8 || tk.ac.nav.mode === 'ORBIT') {
        if (tk.ac.nav.mode !== 'ORBIT') { tk.ac.nav = { mode: 'ORBIT', wps: [], wpi: 0, final: 'NONE', dest: null, orbit: { c: rvPoint, r: 10 }, speedOverride: 330 }; log(st, op, `${tk.callsign} established in tanker orbit`); say(st, { channel: 'TANKER', from: tk.callsign, to: 'OPS', text: `${rt(tk.callsign)}, on the tanker track, fuel available.`, voice: 'TANKER', ref: op.id, refKind: 'op' }) }
        rv.ac.nav = { mode: 'INTERCEPT', wps: [{ name: 'TKR', lat: tk.ac.lat, lon: tk.ac.lon }], wpi: 0, final: 'NONE', dest: null, targetEntity: tk.ac.id, speedOverride: Math.min(rt2.maxKt * 0.8, 450) }
        rv.ac.tgtAlt = rvAlt
        if (distNm(rv.ac, tk.ac) < 2.5 && Math.abs(rv.ac.alt - tk.ac.alt) < 2500) { setStage(st, op, 3, `${rv.callsign} joining the tanker`) }
      } else rv.ac.nav = { mode: 'HOLD', wps: [], wpi: 0, final: 'NONE', dest: null, orbit: { c: rv.ac, r: 6 }, speedOverride: Math.round(rt2.cruiseKt * 0.75) }
      break
    }
    case 3: {
      if (!tk.ac || !rv.ac) { endOp(st, op, 'FAILED', 'Aircraft lost during join'); break }
      rv.ac.nav = { mode: 'TRAIL', wps: [], wpi: 0, final: 'NONE', dest: null, targetEntity: tk.ac.id, trailNm: 0.25 }
      rv.ac.tgtAlt = tk.ac.alt - 200
      if (st.t - op.stageSince > 25 && distNm(rv.ac, tk.ac) < 1) setStage(st, op, 4, `${rv.callsign} in contact, transferring fuel`)
      break
    }
    case 4: {
      if (!tk.ac || !rv.ac) { endOp(st, op, 'FAILED', 'Aircraft lost during transfer'); break }
      rv.ac.nav = { mode: 'TRAIL', wps: [], wpi: 0, final: 'NONE', dest: null, targetEntity: tk.ac.id, trailNm: 0.25 }
      const avail = tk.fuelKg - tt.fuelCap * 0.2, room = rt2.fuelCap - rv.fuelKg
      const amt = Math.max(0, Math.min(25 * 1, avail, room))
      tk.fuelKg -= amt; rv.fuelKg += amt; op.data.given = ((op.data.given as number) ?? 0) + amt
      if (amt <= 0.01 || room <= 1) { setStage(st, op, 5, `Transfer complete: ${Math.round((op.data.given as number) ?? 0)} kg`); rv.lowWarned = false; rv.bingoWarned = false; say(st, { channel: 'TANKER', from: tk.callsign, to: 'OPS', text: `${rt(tk.callsign)}, ${rv.callsign} has taken ${Math.round(((op.data.given as number) ?? 0) / 100) / 10} tonnes. Disconnect.`, voice: 'TANKER', ref: op.id, refKind: 'op' }) }
      break
    }
    case 5: {
      rv.hold = false
      const rop = rv.opId && st.ops[rv.opId]?.status === 'ACTIVE' ? st.ops[rv.opId] : null
      if (rv.ac && !rop) sendHome(st, rv)
      if (rv.ac && rop) rv.ac.nav = { ...rv.ac.nav, mode: 'HOLD', orbit: { c: { lat: rv.ac.lat, lon: rv.ac.lon }, r: 6 } }
      if (tk.ac) sendHome(st, tk)
      setStage(st, op, 6, 'Breakaway. Tanker returning to base')
      break
    }
    case 6: if (landed(tk)) endOp(st, op, 'COMPLETE', `Delivered ${Math.round(((op.data.given as number) ?? 0))} kg to ${rv.callsign}`, false); break
  }
  if (op.status === 'ACTIVE' && op.stage >= 2 && op.stage <= 5 && !rv.ac) endOp(st, op, 'FAILED', 'Receiver no longer airborne')
}
export function opProgress(op: Operation) { return Math.min(1, op.stage / Math.max(1, op.stages.length - 1)) }
export const CIVT = CIV_TYPES
export { nearestAirfield }

function stepEngage(st: GameState, op: Operation) {
  const a = A(st, op); if (opAssetGone(st, op, a)) return; const asset = a!
  const ent = entity(st, op)
  const t = ASSET_TYPES[asset.typeId]
  if (op.stage >= 5) { rtbWait(st, op, asset); return }
  switch (op.stage) {
    case 0: { const r = ensureLaunch(st, op, asset); if (r === 'airborne') setStage(st, op, 2); else if (r === 'wait') setStage(st, op, 1); break }
    case 1: if (asset.ac) setStage(st, op, 2, `${asset.callsign} airborne, weapons free`); break
    case 2: case 3: case 4: {
      if (!asset.ac) break
      if (!ent) { setStage(st, op, 5, (op.data.fired as number) ? 'Target destroyed — RTB' : 'Target gone — RTB'); sendHome(st, asset); break }
      if (asset.status === 'RETURNING') { endOp(st, op, 'ABORTED', 'Bingo fuel', false); break }
      const k = knownPos(st, op, asset, ent)
      const d = distNm(asset.ac, ent)
      asset.ac.tgtAlt = Math.max(1500, Math.min(t.ceiling, ent.alt))
      intercept(asset, ent, k.pos, k.live, k.live ? d : distNm(asset.ac, k.pos))
      if (asset.ac.nav.speedOverride && d > 3) asset.ac.nav.speedOverride = t.maxKt * 0.92
      if (op.stage === 2 && k.live) setStage(st, op, 3, `${asset.callsign} radar lock`)
      const inFlight = st.missiles.some((m) => m.tgt === ent.id && m.by === asset.callsign)
      if (k.live && d <= t.mRange && !inFlight && st.t - ((op.data.lastShot as number) ?? -99) > 6) {
        if (asset.missiles <= 0) { setStage(st, op, 5, 'Winchester — no missiles left, RTB'); sendHome(st, asset); break }
        asset.missiles--; op.data.lastShot = st.t; op.data.fired = ((op.data.fired as number) ?? 0) + 1
        if (op.stage !== 4) setStage(st, op, 4, 'Engaging')
        fireMissile(st, asset.ac, asset.callsign, ent.id, t.pk, 'AAM')
      }
      break
    }
  }
}

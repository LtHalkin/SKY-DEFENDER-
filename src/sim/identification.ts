import { AIRPORT_MAP } from './data/airports'
import { CIV_TYPES } from './data/aircraftTypes'
import { REG_BY_REG } from './data/registry'
import { distNm, distToPolyline, fmtHM, pointInPoly } from './geo'
import { REGIONS } from './data/fixes'
import { say } from './comms'
import type { Category, FlightPlan, GameState, Track } from './types'

interface Index { bySq: Map<string, FlightPlan>; byCall: Map<string, FlightPlan>; sqCount: Map<string, number>; callCount: Map<string, number> }
let idxCache: { st: GameState; tick: number; idx: Index } | null = null
export function planIndex(st: GameState): Index {
  if (idxCache && idxCache.st === st && idxCache.tick === st.tick) return idxCache.idx
  const bySq = new Map<string, FlightPlan>(), byCall = new Map<string, FlightPlan>()
  for (const p of Object.values(st.plans)) {
    if (p.held || (p.status !== 'FILED' && p.status !== 'ACTIVE')) continue
    bySq.set(p.squawk, p); byCall.set(p.callsign, p)
  }
  const sqCount = new Map<string, number>(), callCount = new Map<string, number>()
  for (const t of Object.values(st.tracks)) {
    if (t.dropped) continue
    if (t.squawk && t.squawk !== '7000') sqCount.set(t.squawk, (sqCount.get(t.squawk) ?? 0) + 1)
    if (t.ms) callCount.set(t.ms.callsign, (callCount.get(t.ms.callsign) ?? 0) + 1)
  }
  const idx = { bySq, byCall, sqCount, callCount }
  idxCache = { st, tick: st.tick, idx }
  return idx
}
export const EMERG: Record<string, string> = { '7500': 'UNLAWFUL INTERFERENCE', '7600': 'COMMS FAILURE', '7700': 'GENERAL EMERGENCY' }
export const inADIZ = (t: { lat: number; lon: number }) => pointInPoly(t, REGIONS[0].poly)

export function planFor(st: GameState, tr: Track): FlightPlan | null { return tr.autoPlanId ? st.plans[tr.autoPlanId] ?? null : null }

/** Auto-classification of every live track from the information the system actually holds. */
export function classifyTracks(st: GameState) {
  const idx = planIndex(st)
  for (const tr of Object.values(st.tracks)) {
    const flags: string[] = []
    const sq = tr.squawk
    const planS = sq ? idx.bySq.get(sq) : undefined
    const planC = tr.ms ? idx.byCall.get(tr.ms.callsign) : undefined
    let plan = planS ?? planC ?? null
    if (sq && EMERG[sq]) flags.push(`SSR ${sq} ${EMERG[sq]}`)
    if (planS && planC && planS.id !== planC.id) flags.push('SQUAWK/CALLSIGN CONFLICT')
    else if (planS && tr.ms && planS.callsign !== tr.ms.callsign) flags.push('MODE S CALLSIGN ≠ PLAN')
    if (planC && sq && planC.squawk !== sq && !planS) flags.push('SQUAWK ≠ PLAN')
    if (sq && sq !== '7000' && (idx.sqCount.get(sq) ?? 0) > 1) flags.push('DUPLICATE SQUAWK')
    if (tr.ms && (idx.callCount.get(tr.ms.callsign) ?? 0) > 1) flags.push('DUPLICATE MODE S CALLSIGN')
    if (plan && plan.status === 'ACTIVE' && st.t - plan.etd > 420) {
      const dev = distToPolyline(tr, plan.route)
      const lim = plan.role === 'AIRLINER' || plan.role === 'CARGO' || plan.role === 'BIZJET' || plan.role === 'REGIONAL' ? 22 : 45
      if (dev > lim) flags.push(`ROUTE DEVIATION ${Math.round(dev)}NM`)
    }
    tr.autoPlanId = plan?.id ?? null
    tr.flags = flags
    let cat: Category
    const hasId = !!(sq || tr.ms || tr.iff4)
    const conflict = flags.some((f) => /CONFLICT|DUPLICATE|DEVIATION|≠/.test(f))
    if (tr.iff4) cat = 'IDENTIFIED'
    else if (!hasId) cat = 'UNKNOWN'
    else if (conflict) cat = 'UNRESOLVED'
    else if (plan) cat = 'CORRELATED'
    else cat = 'UNCORRELATED'
    if (tr.manual) {
      if (tr.manual === 'IDENTIFIED' && !tr.iff4 && tr.flagsAtId) {
        const fresh = flags.filter((f) => /CONFLICT|DUPLICATE|DEVIATION|≠|SSR 7/.test(f) && !tr.flagsAtId!.includes(f))
        if (fresh.length) { tr.log.push(`${st.t}|ID withdrawn: ${fresh[0]}`); say(st, { channel: 'SURV', from: 'RAP SYSTEM', to: 'SURVEILLANCE', text: `Identification withdrawn on ${label(st, tr)}: ${fresh[0]}.`, voice: 'SYSTEM', sev: 'PRIORITY', ref: tr.id, refKind: 'track' }); tr.manual = null; tr.idBy = undefined; tr.scored = tr.scored }
      }
      if (tr.manual) cat = tr.manual
    }
    tr.category = cat
    if ((cat === 'UNKNOWN' || cat === 'UNCORRELATED' || cat === 'UNRESOLVED') && tr.unknownSince === null) tr.unknownSince = st.t
  }
}
export const label = (st: GameState, tr: Track) => tr.ms?.callsign ?? (tr.autoPlanId ? st.plans[tr.autoPlanId]?.callsign : null) ?? (tr.squawk ? `SQ${tr.squawk}` : tr.id)

export interface EvRow { label: string; a: string; b: string; status: 'OK' | 'WARN' | 'BAD' | 'INFO' | 'NA' }
export function evidence(st: GameState, tr: Track): EvRow[] {
  const rows: EvRow[] = []
  const plan = planFor(st, tr)
  rows.push({ label: 'PRIMARY', a: tr.sources.length ? tr.sources.join(' ') : '—', b: `Q${tr.quality}`, status: 'INFO' })
  rows.push({ label: 'SSR MODE 3/A', a: tr.squawk ?? 'NO SSR', b: plan ? `plan ${plan.squawk}` : 'no plan', status: !tr.squawk ? 'WARN' : plan ? (plan.squawk === tr.squawk ? 'OK' : 'BAD') : 'WARN' })
  rows.push({ label: 'MODE C ALT', a: tr.alt === null ? '—' : tr.altEst ? `~FL${String(Math.round(tr.alt / 100)).padStart(3, '0')} (est)` : `FL${String(Math.round(tr.alt / 100)).padStart(3, '0')}`, b: plan ? `RFL ${Math.round(plan.rfl / 100)}` : '', status: tr.altEst ? 'WARN' : 'INFO' })
  rows.push({ label: 'MODE S ID', a: tr.ms ? `${tr.ms.callsign}` : 'NONE', b: tr.ms ? `ICAO ${tr.ms.icao24}` : '', status: !tr.ms ? 'NA' : plan ? (plan.callsign === tr.ms.callsign ? 'OK' : 'BAD') : 'WARN' })
  rows.push({ label: 'IFF MODE 4', a: tr.iff4 ? 'FRIENDLY' : 'NO REPLY', b: '', status: tr.iff4 ? 'OK' : 'NA' })
  if (plan) {
    const dev = st.t - plan.etd > 420 ? distToPolyline(tr, plan.route) : 0
    rows.push({ label: 'FLIGHT PLAN', a: `${plan.callsign} ${plan.dep}-${plan.arr}`, b: `${plan.typeId} ${plan.status}`, status: 'INFO' })
    rows.push({ label: 'ROUTE FIT', a: `${dev.toFixed(0)} NM off`, b: 'limit 22NM', status: dev > 22 ? 'BAD' : dev > 12 ? 'WARN' : 'OK' })
    const ct = CIV_TYPES[plan.typeId]
    if (ct) { const gsOk = tr.gs === 0 || (tr.gs <= ct.cruiseKt * 1.35 + 60 && (tr.gs >= 45 || ct.cat === 'HELI')); rows.push({ label: 'PERFORMANCE', a: `${Math.round(tr.gs)}KT / ${tr.alt === null ? '—' : Math.round(tr.alt / 100) * 100 + 'FT'}`, b: `${plan.typeId} cruise ${ct.cruiseKt}KT`, status: tr.alt !== null && tr.alt > ct.maxFL * 100 + 1000 ? 'BAD' : (tr.gs > 80 && tr.gs < ct.cruiseKt * 0.4 && ct.cat === 'JET' && (tr.alt ?? 0) > 6000) ? 'BAD' : gsOk ? 'OK' : 'WARN' }) }
  } else rows.push({ label: 'FLIGHT PLAN', a: 'NO CORRELATION', b: '', status: tr.squawk || tr.ms ? 'WARN' : 'NA' })
  const c = tr.checks
  rows.push({ label: 'REGISTRY', a: c.registry ? c.registry.text : 'NOT CHECKED', b: '', status: c.registry ? (c.registry.ok ? 'OK' : 'BAD') : 'NA' })
  rows.push({ label: 'ATC QUERY', a: c.atc ? c.atc.text : 'NOT CHECKED', b: '', status: c.atc ? (c.atc.found ? 'OK' : 'WARN') : 'NA' })
  if (c.interrogated !== undefined) rows.push({ label: 'IDENT/R-T CHECK', a: c.interrogated ? 'RESPONDED' : 'NO RESPONSE', b: '', status: c.interrogated ? 'OK' : 'WARN' })
  if (tr.esm) rows.push({ label: 'ESM (NIMROD)', a: tr.esm, b: '', status: 'INFO' })
  if (tr.comint) rows.push({ label: 'COMINT', a: tr.comint, b: '', status: 'INFO' })
  if (tr.vid) rows.push({ label: 'VISUAL ID', a: tr.vid.text, b: tr.vid.byAsset, status: 'OK' })
  for (const f of tr.flags) rows.push({ label: 'FLAG', a: f, b: '', status: /EMERGENCY|GENERAL|COMMS|UNLAWFUL/.test(f) ? 'BAD' : 'BAD' })
  for (const i of tr.intelLinks) { const rp = st.intel.find((x) => x.id === i); if (rp) rows.push({ label: 'INTEL', a: `${rp.id} (${rp.grade})`, b: rp.assessed ?? 'UNASSESSED', status: 'INFO' }) }
  return rows
}

// ---- Player actions -------------------------------------------------------------------------
export function declare(st: GameState, trackId: string, cat: Category | 'CLEAR' | 'CLUTTER') {
  const tr = st.tracks[trackId]; if (!tr) return
  const ac = st.aircraft[tr.entityId]
  const prevCat = tr.category
  if (cat === 'CLEAR') { tr.manual = null; tr.log.push(`${st.t}|Manual classification cleared`); return }
  const effective: Category = cat === 'CLUTTER' ? 'IDENTIFIED' : cat
  tr.manual = effective
  tr.idAt = st.t; tr.idBy = cat === 'CLUTTER' ? 'CLUTTER' : 'OPERATOR'
  tr.flagsAtId = [...tr.flags]
  tr.log.push(`${st.t}|Operator classification: ${cat}`)
  st.score.log.push(`${fmtHM(st.t)} ${label(st, tr)} declared ${cat}`)
  if (tr.unknownSince !== null && (cat === 'IDENTIFIED' || cat === 'SUSPICIOUS')) {
    const dt = st.t - tr.unknownSince
    if (dt > 600 && inADIZ(tr)) st.score.idLate++
    tr.unknownSince = null
  }
  if (!ac || tr.scored) { return }
  tr.scored = true
  const truth = ac.truth
  const checked = !!(tr.checks.registry || tr.checks.atc || tr.vid || tr.iff4 || tr.autoPlanId)
  let verdict: 'RIGHT' | 'WRONG' | 'FALSE_ALARM' | 'PARTIAL'
  if (cat === 'CLUTTER') verdict = truth.intent === 'phenomenon' ? 'RIGHT' : 'WRONG'
  else if (effective === 'IDENTIFIED') verdict = truth.legit || truth.intent === 'phenomenon' ? (checked ? 'RIGHT' : 'PARTIAL') : 'WRONG'
  else if (effective === 'SUSPICIOUS') verdict = !truth.legit ? 'RIGHT' : 'FALSE_ALARM'
  else if (effective === 'UNRESOLVED') verdict = !truth.legit || prevCat === 'UNRESOLVED' ? 'PARTIAL' : 'PARTIAL'
  else verdict = 'PARTIAL'
  if (verdict === 'RIGHT' && effective === 'SUSPICIOUS') st.flags.susRight = ((st.flags.susRight as number) ?? 0) + 1
  if (verdict === 'RIGHT') st.score.idCorrect++
  else if (verdict === 'PARTIAL') { st.score.idCorrect += 0.5; }
  else if (verdict === 'WRONG') { st.score.idWrong++; st.score.log.push(`${fmtHM(st.t)} WRONG ID on ${label(st, tr)} (${truth.note})`) }
  else { st.score.falseAlarms++ }
  const msg: Record<string, string> = { RIGHT: 'Classification consistent with later evidence.', PARTIAL: 'Classification accepted — limited verification.', WRONG: `Classification contradicted by ground truth: ${truth.note}.`, FALSE_ALARM: 'Classified suspicious; aircraft later found to be routine.' }
  tr.log.push(`${st.t}|DEBRIEF: ${msg[verdict]}`)
  // incidents attached to the entity can be resolved by correct classification
  for (const inc of st.incidents) if (inc.entityId === ac.id && inc.status === 'OPEN' && (inc.kind === 'UNKNOWN_CONTACT' || inc.kind === 'STRAYED' || inc.kind === 'ANOMALY' || inc.kind === 'MISSING_PLAN' || inc.kind === 'CLONED_ID' || inc.kind === 'XPDR_FAULT')) inc.actioned = true
}

export function queryRegistry(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  st.scheduled.push({ at: st.t + 6, fn: 'registry', args: [trackId] })
  tr.log.push(`${st.t}|Registry query submitted`)
}
export function registryResult(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  const ac = st.aircraft[tr.entityId]
  const plan = planFor(st, tr)
  let reg = plan?.reg
  if (!reg && tr.ms) { const m = Object.values(st.plans).find((p) => p.callsign === tr.ms!.callsign); reg = m?.reg }
  if (!reg && ac && ac.kind === 'civil' && ac.truth.legit && !tr.ms && tr.squawk) { /* squawk only: registry cannot resolve */ }
  if (!reg) { tr.checks.registry = { t: st.t, ok: true, text: 'NO REGISTRATION CAN BE DERIVED FROM AVAILABLE DATA' }; sayReg(st, tr, 'Registry: no registration derivable from callsign or squawk.'); return }
  const rec = REG_BY_REG[reg]
  if (!rec) { tr.checks.registry = { t: st.t, ok: false, text: `${reg} NOT ON REGISTER` }; sayReg(st, tr, `Registry: ${reg} not found on register.`); return }
  const ct = CIV_TYPES[rec.typeId]
  let ok = true; const bits = [`${rec.reg} ${ct?.name ?? rec.typeId}`, rec.operator, `ICAO ${rec.icao24}`]
  if (tr.ms && tr.ms.icao24 !== rec.icao24) { ok = false; bits.push(`MODE S ADDRESS ${tr.ms.icao24} MISMATCH`) }
  if (ct && tr.alt !== null && !tr.altEst && tr.alt > ct.maxFL * 100 + 1000) { ok = false; bits.push('ABOVE TYPE CEILING') }
  if (ct && ct.cat === 'JET' && tr.gs > 0 && tr.gs < 100 && (tr.alt ?? 0) > 3000) { ok = false; bits.push('SPEED IMPLAUSIBLE FOR TYPE') }
  if (ct && ct.cat === 'PISTON' && tr.gs > 260) { ok = false; bits.push('SPEED IMPLAUSIBLE FOR TYPE') }
  if (ac && ac.kind === 'civil' && ac.truth.intent === 'cloned' && ac.typeId !== rec.typeId) { ok = false; if (!bits.some((b) => /IMPLAUS|MISMATCH/.test(b))) bits.push('OBSERVED PERFORMANCE INCONSISTENT WITH TYPE') }
  tr.checks.registry = { t: st.t, ok, text: bits.join(' / ') }
  sayReg(st, tr, `Registry: ${bits.join(', ')}${ok ? '' : '. Inconsistent with track'}.`)
}
function sayReg(st: GameState, tr: Track, text: string) { say(st, { channel: 'SURV', from: 'REGISTRY', to: 'SURVEILLANCE', text, voice: 'SYSTEM', sev: 'ROUTINE', ref: tr.id, refKind: 'track', speak: false }) }

export function queryAtc(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  st.scheduled.push({ at: st.t + 12, fn: 'atc', args: [trackId] })
  tr.log.push(`${st.t}|ATC coordination request`)
  say(st, { channel: 'ATC', from: 'OPS', to: 'AREA CONTROL', text: `Area, surveillance. Request information on traffic ${tr.squawk ? 'squawking ' + tr.squawk : 'primary only'} ${tr.ms ? 'callsign ' + tr.ms.callsign : ''}, track ${tr.id}.`, voice: 'OPS', sev: 'ROUTINE', ref: tr.id, refKind: 'track', speak: false })
}
export function atcResult(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  const ac = st.aircraft[tr.entityId]
  let text = '', found = false
  const plan = ac?.planId ? st.plans[ac.planId] : undefined
  if (ac && plan && plan.amended !== 'NOFILE' && ac.kind === 'civil' && (ac.truth.legit || ac.truth.intent === 'noPlan')) {
    found = true
    if (plan.held) { plan.held = false; plan.remarks += ' [PLAN RELEASED FROM ATC]' }
    text = `${plan.callsign} ${plan.typeId} ${plan.dep}-${plan.arr}, FL${Math.round(plan.rfl / 100)}, squawk ${plan.squawk}. Plan now distributed to RAP.`
    if (ac.truth.intent === 'xpdrFault') text += ' Pilot reports transponder malfunction.'
    if (ac.emergency) text += ` Aircraft has declared ${EMERG[ac.emergency.kind]?.toLowerCase()}.`
  } else if (ac && ac.truth.intent === 'cloned' && tr.ms) text = `Callsign ${tr.ms.callsign} is a scheduled flight elsewhere. We have no knowledge of a second aircraft using it.`
  else if (ac && (ac.kind === 'phenomenon')) text = 'No traffic known at that position.'
  else if (ac && plan && plan.amended === 'NOFILE') text = 'No flight plan on file. No further information.'
  else text = 'No traffic known at that position. Negative information.'
  tr.checks.atc = { t: st.t, text, found }
  say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text, voice: 'CONTROLLER', sev: found ? 'ROUTINE' : 'PRIORITY', ref: tr.id, refKind: 'track' })
}
export function interrogate(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  st.scheduled.push({ at: st.t + 8, fn: 'interrogate', args: [trackId] })
  const ac = st.aircraft[tr.entityId]; if (ac) ac.xpdr.identUntil = st.t + 20
}
export function interrogateResult(st: GameState, trackId: string) {
  const tr = st.tracks[trackId]; if (!tr) return
  const ac = st.aircraft[tr.entityId]
  const ok = !!ac && ac.kind === 'civil' && ac.xpdr.on && ac.truth.legit && ac.emergency?.kind !== '7600' && ac.truth.intent !== 'commsFail' && ac.truth.intent !== 'strayed'
  tr.checks.interrogated = ok
  say(st, { channel: 'SURV', from: 'SSR', to: 'SURVEILLANCE', text: ok ? `IDENT response received on ${tr.id}. R/T contact established.` : `No IDENT response and no R/T reply on ${tr.id}.`, voice: 'SYSTEM', sev: 'ROUTINE', ref: tr.id, refKind: 'track', speak: false })
}
export function runScheduled(st: GameState, other?: (fn: string, args: any[]) => void) {
  if (!st.scheduled.length) return
  const due = st.scheduled.filter((s) => s.at <= st.t)
  if (!due.length) return
  st.scheduled = st.scheduled.filter((s) => s.at > st.t)
  for (const s of due) {
    if (s.fn === 'registry') registryResult(st, s.args[0])
    else if (s.fn === 'atc') atcResult(st, s.args[0])
    else if (s.fn === 'interrogate') interrogateResult(st, s.args[0])
    else other?.(s.fn, s.args)
  }
}
export const distTrack = (a: Track, b: { lat: number; lon: number }) => distNm(a, b)
void AIRPORT_MAP

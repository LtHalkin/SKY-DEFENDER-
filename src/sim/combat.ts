import { ASSET_TYPES, BATTERY_TYPES, CIV_TYPES, SITE_MAP } from './data/aircraftTypes'
import { AIRPORTS } from './data/airports'
import { bearingDeg, destPoint, distNm, fmtHM } from './geo'
import { rt, say } from './comms'
import { closeIncident, openIncident } from './incidents'
import { label } from './identification'
import type { Aircraft, GameState, Track } from './types'

/** Coins are the game currency; every award is tied to a real sim event. */
export function award(st: GameState, n: number, why: string, at?: { lat: number; lon: number }) {
  st.coins += n
  st.coinLog.push({ t: st.t, n, why })
  if (st.coinLog.length > 200) st.coinLog.shift()
  if (at) st.events.push({ type: 'fx', kind: 'coins', lat: at.lat, lon: at.lon, n, text: why })
}
export const trackOf = (st: GameState, entityId: string): Track | undefined => { const id = st.trackByEntity[entityId]; return id ? st.tracks[id] : undefined }
export const isHostileKind = (ac: Aircraft) => ac.kind === 'foreign'

export function initBatteries(st: GameState) {
  for (const b of st.cfg.batteries ?? []) {
    const t = BATTERY_TYPES[b.typeId], s = SITE_MAP[b.site]; if (!t || !s) continue
    st.batteries.push({ id: b.id, typeId: t.id, name: `${t.short} ${s.name.toUpperCase()}`, site: s.id, lat: s.lat, lon: s.lon, range: t.range, missiles: t.missiles + 2 * (st.cfg.upgrades?.samMag ?? 0), maxMissiles: t.missiles + 2 * (st.cfg.upgrades?.samMag ?? 0), reloadSec: t.reloadSec * Math.pow(0.8, st.cfg.upgrades?.samReload ?? 0), readyAt: 0, pk: t.pk, auto: false })
  }
}

// ---------------- hostile raids ----------------
const TARGETS = [
  ...AIRPORTS.filter((a) => ['EGXE', 'EGQL', 'EGXC', 'EGQS', 'EGXW', 'EGVN', 'EGYM'].includes(a.icao)).map((a) => ({ name: a.name, lat: a.lat, lon: a.lon, value: 20 })),
  { name: 'London', lat: 51.51, lon: -0.12, value: 30 }, { name: 'Edinburgh', lat: 55.95, lon: -3.19, value: 25 }, { name: 'Manchester', lat: 53.48, lon: -2.24, value: 25 },
  { name: 'Newcastle', lat: 54.97, lon: -1.61, value: 20 }, { name: 'Aberdeen', lat: 57.15, lon: -2.1, value: 20 }, { name: 'Belfast', lat: 54.6, lon: -5.93, value: 20 },
]
const NA = 'ABCDEFGHJKLMNPRSTUVWXYZ'
export const RAID_TARGETS = TARGETS
export interface RaidOpts { target?: string; low?: boolean; split?: string; decoys?: number; from?: number; vip?: string; dist?: number }
const targetByName = (n: string) => TARGETS.find((t) => t.name === n || t.name.toUpperCase().includes(n.toUpperCase()))
function makeBandit(st: GameState, tid: string, start: { lat: number; lon: number }, tgt: { name: string; lat: number; lon: number; value: number }, intent: 'hostile' | 'decoy', alt: number): Aircraft {
  const r = st.rng, t = CIV_TYPES[tid]
  const exit = destPoint(tgt, (bearingDeg(tgt, start) + r.range(-40, 40) + 360) % 360, 260)
  const hard = 1 - 0.25 * (st.cfg.upgrades?.hardened ?? 0)
  return {
    id: `AC${String(++st.nextId).padStart(5, '0')}`, kind: 'foreign', callsign: `${NA[r.int(0, 22)]}${NA[r.int(0, 22)]}${r.int(10, 99)}`, reg: 'UNKNOWN', icao24: 'UNKN', typeId: tid, typeName: t.name, operator: intent === 'decoy' ? 'Decoy' : 'Hostile',
    role: 'FOREIGN', lat: start.lat, lon: start.lon, alt, hdg: bearingDeg(start, tgt), gs: t.cruiseKt, vs: 0, tgtAlt: alt, tgtSpd: t.cruiseKt,
    nav: { mode: 'ROUTE', wps: [{ name: 'S', ...start }, { name: 'TGT', lat: tgt.lat, lon: tgt.lon }, { name: 'EXIT', ...exit }], wpi: 1, final: 'REMOVE', dest: null },
    phase: 'ENROUTE', xpdr: { on: false, squawk: '0000', modeC: false, modeS: false, msCallsign: '', msIcao24: '', iff4: false, identUntil: 0 },
    planId: null, truth: { intent, legit: false, benign: intent === 'decoy', note: intent === 'decoy' ? 'Decoy drone sent to draw off interceptors' : `${t.name} on a hostile run towards ${tgt.name}` }, rcs: t.rcs, emitter: 'NONE', spawnedAt: st.t,
    cruiseKt: t.cruiseKt, maxAlt: t.maxFL * 100, climbFpm: t.climbFpm, turnRate: t.turn, raid: { ...tgt, value: intent === 'decoy' ? 0 : Math.round(tgt.value * hard) },
  }
}
function pendBandit(st: GameState, ac: Aircraft, tgtName: string) {
  st.pending.push({ entityId: ac.id, kind: 'HOSTILE', title: `FAST UNKNOWN HEADING FOR ${tgtName.toUpperCase()}`, severity: 3, needs: 'IDENTIFY, WARN, ENGAGE IF NO COMPLIANCE', deadlineSec: 1500, announce: `Unknown fast contact, no transponder, heading ${Math.round(ac.hdg)} towards ${tgtName}${ac.alt < 2000 ? ', very low' : ''}.`, created: st.t, intent: ac.truth.intent })
}
export function spawnRaid(st: GameState, size = 1, typeId?: string, o: RaidOpts = {}): Aircraft[] {
  const r = st.rng
  let tgt = (o.target && targetByName(o.target)) || r.pick(TARGETS)
  const vipAc = o.vip ? st.aircraft[o.vip] : undefined
  if (vipAc) tgt = { name: 'VIP flight', lat: vipAc.lat, lon: vipAc.lon, value: 35 }
  const from = o.from ?? r.pick([0, 20, 45, 70, 330, 300])
  const dist = o.dist ?? r.range(160, 230)
  const start0 = destPoint(tgt, from + r.range(-15, 15), dist)
  const out: Aircraft[] = []
  const tid = typeId ?? (o.low ? 'BLL' : r.weighted(['BFJ', 'BBM', 'BDR'], (x) => ({ BFJ: 5, BBM: 2, BDR: 3 }[x]!)))
  const splitTgt = o.split ? targetByName(o.split) : undefined
  for (let i = 0; i < size; i++) {
    const start = destPoint(start0, r.range(0, 360), i * 4)
    const alt = tid === 'BLL' || o.low ? r.range(300, 700) : tid === 'BDR' ? r.range(6000, 12000) : r.range(16000, 30000)
    const ac = makeBandit(st, tid, start, tgt, 'hostile', alt)
    if (splitTgt && i % 2 === 1) ac.raid!.split = { ...splitTgt, value: Math.round(splitTgt.value * (1 - 0.25 * (st.cfg.upgrades?.hardened ?? 0))) }
    if (vipAc) ac.raid!.vip = true
    st.aircraft[ac.id] = ac; out.push(ac); pendBandit(st, ac, tgt.name)
  }
  for (let i = 0; i < (o.decoys ?? 0); i++) {
    const start = destPoint(start0, r.range(0, 360), 6 + i * 5)
    const ac = makeBandit(st, 'BDC', start, tgt, 'decoy', r.range(16000, 28000))
    st.aircraft[ac.id] = ac; out.push(ac); pendBandit(st, ac, tgt.name)
  }
  if (splitTgt && size > 1) st.flags['splitPending'] = 1
  return out
}
/** A lost allied fighter with radio failure: looks exactly like a raider until identified. */
export function spawnAllied(st: GameState): Aircraft {
  const r = st.rng, base = r.pick(TARGETS.filter((t) => t.name.startsWith('RAF')))
  const start = destPoint(base, r.pick([20, 50, 80, 110]), r.range(150, 200))
  const ap = AIRPORTS.find((a) => a.name === base.name)!
  const ac = makeBandit(st, 'ALJ', start, { ...base, value: 0 }, 'decoy', r.range(14000, 24000))
  ac.operator = 'Allied air force'; ac.truth.note = 'Allied fighter with radio failure, diverting to land'
  ac.nav = { mode: 'ROUTE', wps: [{ name: 'S', ...start }, { name: ap.icao, lat: ap.lat, lon: ap.lon }], wpi: 1, final: 'LAND', dest: ap.icao }
  st.aircraft[ac.id] = ac; pendBandit(st, ac, base.name)
  return ac
}

// ---------------- warnings ----------------
export function escortNear(st: GameState, ent: Aircraft, nm = 6) {
  return Object.values(st.assets).find((a) => a.ac && ASSET_TYPES[a.typeId].role === 'FIGHTER' && distNm(a.ac, ent) <= nm)
}
export function warn(st: GameState, trackId: string): string | null {
  const tr = st.tracks[trackId]; if (!tr) return 'No track'
  const ent = st.aircraft[tr.entityId]; if (!ent) return 'Target gone'
  if (ent.kind === 'asset') return 'That is one of ours'
  const esc = escortNear(st, ent); if (!esc) return 'An interceptor must be alongside (within 6 NM) to give the warning'
  if (ent.warnedAt && st.t - ent.warnedAt < 40) return 'Warning already in progress'
  ent.warnedAt = st.t
  say(st, { channel: 'PILOT', from: esc.callsign, to: label(st, tr), text: `${rt(esc.callsign)}: unidentified aircraft, you are entering controlled airspace. Turn away now and follow my instructions.`, voice: 'PILOT', sev: 'PRIORITY', ref: tr.id, refKind: 'track' })
  st.scheduled.push({ at: st.t + 15, fn: 'warnResult', args: [trackId, esc.id] })
  return null
}
function turnAway(st: GameState, ent: Aircraft) {
  if (ent.kind === 'foreign') {
    const exit = destPoint(ent, (ent.raid ? bearingDeg(ent.raid, ent) : (ent.hdg + 180) % 360), 300)
    ent.nav = { mode: 'ROUTE', wps: [{ name: 'EXIT', ...exit }], wpi: 0, final: 'REMOVE', dest: null }
    if (ent.raid) ent.raid.breached = true // no longer a threat to its target
  } else {
    const ap = AIRPORTS.filter((a) => (a.country === 'GB' || a.country === 'IE') && a.kind !== 'MIL').sort((p, q) => distNm(p, ent) - distNm(q, ent))[0]
    ent.nav = { mode: 'LAND', wps: [], wpi: 0, final: 'LAND', dest: ap.icao }
  }
  ent.complied = true
}
export function warnResult(st: GameState, trackId: string, escId: string) {
  const tr = st.tracks[trackId]; const ent = tr ? st.aircraft[tr.entityId] : undefined
  const esc = st.assets[escId]
  if (!tr || !ent) return
  const lvl = st.cfg.level ?? 1
  const p = ent.truth.intent === 'hostile' ? Math.max(0.12, 0.4 - lvl * 0.025) : ent.truth.intent === 'foreignState' ? 0.75 : ent.truth.intent === 'cloned' ? 0.55 : 1
  const who = esc?.callsign ?? 'INTERCEPTOR'
  if (ent.typeId === 'BDC') { tr.noReply = true; say(st, { channel: 'PILOT', from: who, to: 'OPS', text: `${rt(who)}: no response at all — no cockpit, it looks unmanned. Recommend visual identification.`, voice: 'PILOT', sev: 'PRIORITY', ref: tr.id, refKind: 'track' }); return }
  const comply = st.rng.chance(p)
  if (comply) {
    turnAway(st, ent); tr.complied = true
    say(st, { channel: 'PILOT', from: who, to: 'OPS', text: `${rt(who)}: target is complying${ent.kind === 'foreign' ? ', turning away and leaving our airspace' : ', following us to land'}.`, voice: 'PILOT', sev: 'PRIORITY', ref: tr.id, refKind: 'track' })
    award(st, ent.kind === 'foreign' ? 40 : 15, 'Intruder complied', ent)
    st.events.push({ type: 'ui', name: 'complied:' + tr.id })
  } else if (ent.kind === 'foreign') {
    tr.hostile = true; tr.manual = 'SUSPICIOUS'; ent.hostile = true
    say(st, { channel: 'PILOT', from: who, to: 'OPS', text: `${rt(who)}: target is refusing all instructions and continuing inbound. Request permission to engage.`, voice: 'PILOT', sev: 'URGENT', ref: tr.id, refKind: 'track' })
    st.events.push({ type: 'ui', name: 'refused:' + tr.id })
  } else {
    tr.manual = 'SUSPICIOUS'; tr.noReply = true
    say(st, { channel: 'PILOT', from: who, to: 'OPS', text: `${rt(who)}: civil aircraft ignoring signals. Continuing to escort; police informed at destination.`, voice: 'PILOT', sev: 'PRIORITY', ref: tr.id, refKind: 'track' })
  }
}
/** Called when a visual ID is made: hostile raiders are obvious at close range. */
export function onVisual(st: GameState, ent: Aircraft, tr?: Track) {
  if (ent.truth.intent === 'decoy' && tr) {
    tr.decoy = true; tr.hostile = false; tr.manual = 'IDENTIFIED'; ent.hostile = false
    st.flags.decoysFound = ((st.flags.decoysFound as number) ?? 0) + 1
    award(st, 20, ent.typeId === 'BDC' ? 'Decoy identified' : 'Allied jet identified', ent)
    for (const inc of st.incidents) if (inc.entityId === ent.id && inc.closed === null) closeIncident(st, inc, 'RESOLVED', ent.typeId === 'BDC' ? 'Identified as a decoy' : 'Identified as an allied aircraft')
    st.pending = st.pending.filter((p) => p.entityId !== ent.id)
    if (ent.typeId === 'ALJ') { ent.complied = true; tr.complied = true }
    return
  }
  if (ent.truth.intent === 'hostile' && tr) {
    tr.hostile = true; ent.hostile = true; tr.manual = 'SUSPICIOUS'
    st.events.push({ type: 'ui', name: 'hostile:' + tr.id })
  }
}

// ---------------- weapons ----------------
let mid = 1
export function fireMissile(st: GameState, from: { lat: number; lon: number; alt: number }, by: string, targetId: string, pk: number, kind: 'AAM' | 'SAM') {
  st.missiles.push({ id: mid++, lat: from.lat, lon: from.lon, alt: from.alt, tgt: targetId, by, pk, speed: kind === 'SAM' ? 1700 : 1500, born: st.t, kind, trail: [] })
  st.events.push({ type: 'fx', kind: 'launch', lat: from.lat, lon: from.lon })
  say(st, { channel: kind === 'SAM' ? 'OPS' : 'PILOT', from: by, to: 'OPS', text: kind === 'SAM' ? `${by}: missile away.` : `${rt(by)}: Fox, missile away.`, voice: kind === 'SAM' ? 'OPS' : 'PILOT', sev: 'PRIORITY', ref: targetId })
}
export function samFire(st: GameState, batteryId: string, trackId: string): string | null {
  const b = st.batteries.find((x) => x.id === batteryId); if (!b) return 'No battery'
  const tr = st.tracks[trackId]; if (!tr || tr.dropped) return 'No live track'
  const ent = st.aircraft[tr.entityId]; if (!ent) return 'Target gone'
  if (!tr.hostile) return 'Weapons tight — target has not been declared hostile'
  if (b.missiles <= 0) return `${b.name} has no missiles left`
  if (st.t < b.readyAt) return `${b.name} reloading (${Math.ceil(b.readyAt - st.t)}s)`
  const d = distNm(b, ent); if (d > b.range) return `Target out of range (${Math.round(d)} NM, max ${b.range})`
  b.missiles--; b.readyAt = st.t + b.reloadSec
  fireMissile(st, { lat: b.lat, lon: b.lon, alt: 0 }, b.name, ent.id, b.pk, 'SAM')
  return null
}
function destroy(st: GameState, ent: Aircraft, by: string) {
  const tr = trackOf(st, ent.id)
  delete st.aircraft[ent.id]
  if (tr) { tr.dropped = true; tr.log.push(`${st.t}|Destroyed by ${by}`) }
  st.splashes++
  st.events.push({ type: 'fx', kind: 'splash', lat: ent.lat, lon: ent.lon })
  say(st, { channel: 'PILOT', from: by, to: 'OPS', text: `Splash one. ${ent.typeName} destroyed.`, voice: 'PILOT', sev: 'URGENT', ref: tr?.id })
  award(st, ent.typeId === 'BBM' ? 90 : 60, 'Hostile destroyed', ent)
  for (const inc of st.incidents) if (inc.entityId === ent.id && inc.closed === null) closeIncident(st, inc, 'RESOLVED', `Hostile destroyed by ${by}`)
  st.pending = st.pending.filter((p) => p.entityId !== ent.id)
  for (const m of st.missiles) if (m.tgt === ent.id) m.tgt = ''
}
export function stepCombat(st: GameState, dt: number) {
  // missiles
  for (const m of st.missiles) {
    const tgt = m.tgt ? st.aircraft[m.tgt] : undefined
    if (!tgt || st.t - m.born > 80) { m.tgt = ''; continue }
    const d = distNm(m, tgt), step = (m.speed / 3600) * dt
    m.trail.push({ lat: m.lat, lon: m.lon }); if (m.trail.length > 8) m.trail.shift()
    if (d <= step * 1.2) {
      if (st.rng.chance(m.pk)) destroy(st, tgt, m.by)
      else { st.events.push({ type: 'fx', kind: 'miss', lat: tgt.lat, lon: tgt.lon }); say(st, { channel: 'PILOT', from: m.by, to: 'OPS', text: `${m.by}: missed, target still flying.`, voice: m.kind === 'SAM' ? 'OPS' : 'PILOT', sev: 'PRIORITY' }) }
      m.tgt = ''; continue
    }
    const p = destPoint(m, bearingDeg(m, tgt), step); m.lat = p.lat; m.lon = p.lon; m.alt += (tgt.alt - m.alt) * 0.2
  }
  st.missiles = st.missiles.filter((m) => m.tgt)
  // automatic SAM engagement of declared-hostile tracks
  for (const b of st.batteries) {
    if (!b.auto || b.missiles <= 0 || st.t < b.readyAt) continue
    for (const tr of Object.values(st.tracks)) {
      if (tr.dropped || !tr.hostile) continue
      const ent = st.aircraft[tr.entityId]; if (!ent) continue
      if (distNm(b, ent) > b.range) continue
      if (st.missiles.some((m) => m.tgt === ent.id)) continue
      samFire(st, b.id, tr.id); break
    }
  }
  // moving VIP target, raid splits, raids reaching their target
  for (const ac of Object.values(st.aircraft)) {
    const rd = ac.raid
    if (!rd || rd.breached || ac.complied) continue
    if (rd.vip) {
      const vip = st.aircraft[st.flags.vipId as string]
      if (!vip) { rd.breached = true; ac.nav = { mode: 'ROUTE', wps: [{ name: 'EXIT', ...destPoint(ac, (ac.hdg + 180) % 360, 300) }], wpi: 0, final: 'REMOVE', dest: null }; continue }
      rd.lat = vip.lat; rd.lon = vip.lon
      if (ac.nav.wps[1]) { ac.nav.wps[1] = { name: 'TGT', lat: vip.lat, lon: vip.lon }; ac.nav.wpi = 1 }
    }
    if (rd.split && distNm(ac, rd) < 90) {
      const sp = rd.split; rd.split = undefined
      Object.assign(rd, sp)
      ac.nav = { mode: 'ROUTE', wps: [{ name: 'TGT', lat: sp.lat, lon: sp.lon }, { name: 'EXIT', ...destPoint(sp, bearingDeg(sp, ac), 260) }], wpi: 0, final: 'REMOVE', dest: null }
      if (!st.flags['splitAnnounced:' + st.tick]) { st.flags['splitAnnounced:' + st.tick] = 1; say(st, { channel: 'SURV', from: 'RADAR CONTROLLER', to: 'OPS', text: `The raid is splitting! Part of the group has turned towards ${sp.name}.`, voice: 'CONTROLLER', sev: 'URGENT' }); st.events.push({ type: 'alert', text: `RAID SPLITTING — NEW TARGET ${sp.name.toUpperCase()}`, sev: 3 }) }
      const tr = trackOf(st, ac.id); if (tr) tr.log.push(`${st.t}|Turned towards ${sp.name}`)
    }
    if (distNm(ac, rd) < 8) {
      rd.breached = true
      if (rd.value <= 0) continue // decoys do no damage
      st.airspace = Math.max(0, st.airspace - rd.value)
      st.flags['breach:' + rd.name] = true
      if (rd.vip) st.flags.vipHit = true
      award(st, -60, `Hostile reached ${rd.name}`, ac)
      st.events.push({ type: 'fx', kind: 'breach', lat: ac.lat, lon: ac.lon, text: rd.name })
      say(st, { channel: 'OPS', from: 'COMMANDER', to: 'ALL', text: `Hostile aircraft has ${rd.vip ? 'reached the VIP flight' : 'overflown ' + rd.name}. Airspace integrity ${st.airspace} percent.`, voice: 'OPS', sev: 'URGENT' })
      for (const inc of st.incidents) if (inc.entityId === ac.id && inc.closed === null) closeIncident(st, inc, 'FAILED', `Reached ${rd.name}`)
      if (st.airspace <= 0 && !st.ended) { st.ended = true; st.flags.result = 'FAILED' }
    }
  }
  // raids that leave after a warning: close incidents as resolved
  for (const inc of st.incidents) if (inc.kind === 'HOSTILE' && inc.closed === null && inc.entityId && !st.aircraft[inc.entityId]) {
    closeIncident(st, inc, 'RESOLVED', 'Hostile left the area')
  }
}
export function hostileDirector(st: GameState) {
  if (!st.cfg.hostiles) return
  const lvl = st.cfg.level ?? 1
  if (st.flags.nextRaid === undefined) st.flags.nextRaid = st.t + st.rng.range(240, 420)
  if (st.t < (st.flags.nextRaid as number)) return
  const size = Math.min(4, 1 + Math.floor(st.rng.next() * (1 + lvl / 3)))
  const roll = st.rng.next()
  if (roll < 0.15) spawnAllied(st)
  else spawnRaid(st, size, undefined, { low: lvl >= 3 && roll < 0.35, decoys: lvl >= 4 && roll > 0.7 ? 1 + st.rng.int(0, 1) : 0, split: lvl >= 5 && size >= 2 && roll > 0.5 ? st.rng.pick(TARGETS).name : undefined })
  st.flags.nextRaid = st.t + Math.max(300, 900 - lvl * 50) * st.rng.range(0.7, 1.3)
}
export function scheduledCombat(st: GameState, fn: string, args: any[]) { if (fn === 'warnResult') warnResult(st, args[0], args[1]) }
export const hostileSummary = (st: GameState) => `${Object.values(st.tracks).filter((t) => !t.dropped && t.hostile).length} hostile at ${fmtHM(st.t)}`
void openIncident

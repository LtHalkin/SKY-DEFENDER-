import { spawnRaid, spawnAllied, type RaidOpts } from './combat'
import { spawnEvent } from './events'
import { planDraft, fileFlight, launchFlight } from './traffic'
import { routeBetween } from './routes'
import { say } from './comms'
import type { GameState, Objective } from './types'

export interface MissionEvent { at: number; raid?: RaidOpts & { size: number; type?: string }; allied?: boolean; event?: string; vip?: { from: string; to: string }; say?: string }
export interface MissionObj { id: string; text: string; kind: 'protect' | 'splash' | 'decoys' | 'airspace' | 'vipEscort' | 'vipSafe' | 'ids' | 'survive'; target?: string; n?: number }
export interface Mission { id: string; title: string; brief: string[]; tip: string; hour: number; weather: 'CLEAR' | 'RAIN' | 'STORM'; minutes: number; events: MissionEvent[]; objectives: MissionObj[]; reward: number; radarOff?: string[]; seed: number }

const R = (at: number, size: number, o: RaidOpts & { type?: string } = {}): MissionEvent => ({ at, raid: { size, ...o } })
export const MISSIONS: Mission[] = [
  { id: 'M1', title: '1 · FIRST WATCH', seed: 9101, hour: 10, weather: 'CLEAR', minutes: 40, reward: 300,
    brief: ['A quiet morning — your first watch in command. A few aircraft need checking.', 'Intelligence warns a hostile drone may probe RAF Leeming later in the shift.'],
    tip: 'Yellow planes are unknown: CHECK IT, then MARK SAFE. When the drone appears, SEND JET TO LOOK, then ENGAGE once it is confirmed hostile.',
    events: [{ at: 2, event: 'strayed' }, { at: 6, event: 'missing' }, { at: 10, event: 'strayed' }, R(12, 1, { type: 'BDR', target: 'RAF Leeming', from: 45, dist: 150 })],
    objectives: [{ id: 'a', text: 'Identify 3 contacts correctly', kind: 'ids', n: 3 }, { id: 'b', text: 'Protect RAF Leeming', kind: 'protect', target: 'RAF Leeming' }, { id: 'c', text: 'Finish the watch', kind: 'survive' }] },
  { id: 'M2', title: '2 · NORTHERN WATCH', seed: 9102, hour: 14, weather: 'CLEAR', minutes: 40, reward: 450,
    brief: ['Hostile aircraft have been probing the north-east coast.', 'Aberdeen is the likely target. Keep it safe.'],
    tip: 'Raids come in over the North Sea. Scramble early — a jet launched late chases from behind and may never catch up. Use MAX speed to close.',
    events: [R(3, 2, { type: 'BFJ', target: 'Aberdeen', from: 10 }), R(12, 1, { type: 'BBM', target: 'RAF Lossiemouth', from: 330 }), R(20, 2, { type: 'BFJ', target: 'Aberdeen', from: 25 })],
    objectives: [{ id: 'a', text: 'Protect Aberdeen', kind: 'protect', target: 'Aberdeen' }, { id: 'b', text: 'Destroy 3 hostiles', kind: 'splash', n: 3 }] },
  { id: 'M3', title: '3 · LOW AND FAST', seed: 9103, hour: 12, weather: 'CLEAR', minutes: 40, reward: 600,
    brief: ['Raiders are flying at wave-top height to stay under our radar.', 'They will appear late and close. Newcastle must not be hit.'],
    tip: 'Low raiders are below the radar horizon until near the coast. Put a jet on PATROL over the sea, or buy a GAP-FILLER radar on the Northumberland coast.',
    events: [R(4, 2, { low: true, target: 'Newcastle', from: 70, dist: 150 }), R(14, 2, { low: true, target: 'Newcastle', from: 45, dist: 150 }), R(24, 1, { low: true, target: 'RAF Leeming', from: 60, dist: 150 })],
    objectives: [{ id: 'a', text: 'Protect Newcastle', kind: 'protect', target: 'Newcastle' }, { id: 'b', text: 'Destroy 3 low raiders', kind: 'splash', n: 3 }] },
  { id: 'M4', title: '4 · SMOKE AND MIRRORS', seed: 9104, hour: 15, weather: 'CLEAR', minutes: 40, reward: 750,
    brief: ['The enemy is sending decoy drones alongside real raiders to soak up your interceptors.', 'A lost allied jet with a radio failure is also somewhere out there.'],
    tip: 'Decoys look exactly like raiders on radar. Only a visual ID tells them apart — and decoys cannot be engaged. Do not let them pull every jet away.',
    events: [R(3, 1, { type: 'BFJ', target: 'Edinburgh', decoys: 2, from: 20 }), R(11, 2, { type: 'BFJ', target: 'Newcastle', decoys: 2, from: 60 }), { at: 18, allied: true }, R(22, 1, { type: 'BBM', target: 'London', decoys: 1, from: 80 })],
    objectives: [{ id: 'a', text: 'Identify 3 decoys or allied jets', kind: 'decoys', n: 3 }, { id: 'b', text: 'Destroy 2 hostiles', kind: 'splash', n: 2 }, { id: 'c', text: 'Keep airspace above 70%', kind: 'airspace', n: 70 }] },
  { id: 'M5', title: '5 · THE FAEROES GAP', seed: 9105, hour: 11, weather: 'CLEAR', minutes: 40, reward: 900, radarOff: ['BENB', 'SAXA'],
    brief: ['Benbecula and Saxa Vord radars are down. The north-west is blind.', 'Long-range raiders will use the gap to reach Edinburgh and Belfast.'],
    tip: 'Fly an E-3D into the gap (PATROL A POINT west of the Hebrides) or buy a radar at Stornoway or Unst. Without coverage you will not see them coming.',
    events: [R(4, 2, { type: 'BBM', target: 'Edinburgh', from: 315, dist: 200 }), R(12, 2, { type: 'BFJ', target: 'Aberdeen', from: 330 }), R(22, 2, { type: 'BFJ', target: 'Belfast', from: 300 })],
    objectives: [{ id: 'a', text: 'Protect Edinburgh', kind: 'protect', target: 'Edinburgh' }, { id: 'b', text: 'Protect Belfast', kind: 'protect', target: 'Belfast' }, { id: 'c', text: 'Destroy 4 hostiles', kind: 'splash', n: 4 }] },
  { id: 'M6', title: '6 · NIGHT OWLS', seed: 9106, hour: 23, weather: 'CLEAR', minutes: 40, reward: 1100,
    brief: ['A night shift. Pilots need to get much closer — and take longer — to identify anything.', 'Raids are expected all night.'],
    tip: 'Visual IDs are slow in the dark. Warnings still work: if a raider refuses, it is confirmed hostile without a visual.',
    events: [R(4, 2, { type: 'BFJ', target: 'RAF Leeming', from: 50 }), R(11, 1, { type: 'BBM', target: 'RAF Coningsby', decoys: 1, from: 80 }), R(18, 2, { low: true, target: 'Newcastle', from: 60, dist: 150 }), R(24, 2, { type: 'BFJ', target: 'London', from: 90 })],
    objectives: [{ id: 'a', text: 'Destroy 4 hostiles', kind: 'splash', n: 4 }, { id: 'b', text: 'Keep airspace above 60%', kind: 'airspace', n: 60 }] },
  { id: 'M7', title: '7 · SPLIT DECISION', seed: 9107, hour: 16, weather: 'CLEAR', minutes: 40, reward: 1300,
    brief: ['Large raids will split into two groups close to the coast.', 'You will have to choose where each interceptor goes.'],
    tip: 'Watch for the RAID SPLITTING alert. Keep one jet in reserve and use missile batteries to cover the second target.',
    events: [R(4, 4, { type: 'BFJ', target: 'London', split: 'Manchester', from: 75 }), R(15, 4, { type: 'BFJ', target: 'Edinburgh', split: 'Newcastle', from: 25 }), R(23, 2, { type: 'BBM', target: 'Manchester', from: 60 })],
    objectives: [{ id: 'a', text: 'Protect London', kind: 'protect', target: 'London' }, { id: 'b', text: 'Protect Manchester', kind: 'protect', target: 'Manchester' }, { id: 'c', text: 'Destroy 5 hostiles', kind: 'splash', n: 5 }] },
  { id: 'M8', title: '8 · VIP ESCORT', seed: 9108, hour: 13, weather: 'CLEAR', minutes: 45, reward: 1500,
    brief: ['A VIP flight (callsign VIP01) departs RAF Northolt for Edinburgh.', 'Intelligence says hostile aircraft will try to reach it. Escort it all the way.'],
    tip: 'Select VIP01 and press ESCORT / FOLLOW to keep a jet with it. Hostiles will chase the VIP — intercept them before they get within 8 NM.',
    events: [{ at: 1, vip: { from: 'EGWU', to: 'EGPH' }, say: 'VIP01 is starting up at Northolt. Assign an escort.' }, R(8, 2, { type: 'BFJ', vip: 'VIP', from: 60, dist: 170 }), R(18, 2, { type: 'BFJ', vip: 'VIP', decoys: 1, from: 20, dist: 170 })],
    objectives: [{ id: 'a', text: 'Escort VIP01 for 10 minutes', kind: 'vipEscort', n: 600 }, { id: 'b', text: 'VIP01 lands safely', kind: 'vipSafe' }, { id: 'c', text: 'Destroy 2 hostiles', kind: 'splash', n: 2 }] },
  { id: 'M9', title: '9 · STORM FRONT', seed: 9109, hour: 17, weather: 'STORM', minutes: 40, reward: 1700,
    brief: ['A violent storm is blinding radars and closing airfields.', 'The enemy is using the weather as cover.'],
    tip: 'Weather cells hide contacts. Repair radars, keep tankers busy, and do not let fighters run dry.',
    events: [{ at: 3, event: 'radar' }, R(5, 2, { type: 'BFJ', target: 'Aberdeen', from: 30 }), { at: 10, event: '7700' }, R(13, 2, { low: true, target: 'Newcastle', from: 60, dist: 150 }), R(22, 3, { type: 'BFJ', target: 'London', split: 'RAF Coningsby', from: 80 })],
    objectives: [{ id: 'a', text: 'Keep airspace above 60%', kind: 'airspace', n: 60 }, { id: 'b', text: 'Destroy 4 hostiles', kind: 'splash', n: 4 }, { id: 'c', text: 'Finish the watch', kind: 'survive' }] },
  { id: 'M10', title: '10 · BLACK SATURDAY', seed: 9110, hour: 21, weather: 'RAIN', minutes: 45, reward: 2500,
    brief: ['Everything at once. Multiple waves from every direction, at night, with decoys and splits.', 'Hold the line.'],
    tip: 'Use everything: auto-fire on your batteries, tankers to keep jets up, and decoys identified before you commit.',
    events: [R(3, 3, { type: 'BFJ', target: 'Edinburgh', decoys: 1, from: 20 }), R(8, 2, { low: true, target: 'Newcastle', from: 60, dist: 150 }), R(13, 4, { type: 'BFJ', target: 'London', split: 'Manchester', decoys: 2, from: 80 }), R(19, 2, { type: 'BBM', target: 'Belfast', from: 300 }), R(24, 4, { type: 'BFJ', target: 'Aberdeen', split: 'Edinburgh', from: 15 }), R(28, 2, { low: true, target: 'RAF Coningsby', from: 70, dist: 150 })],
    objectives: [{ id: 'a', text: 'Protect London', kind: 'protect', target: 'London' }, { id: 'b', text: 'Protect Edinburgh', kind: 'protect', target: 'Edinburgh' }, { id: 'c', text: 'Protect Manchester', kind: 'protect', target: 'Manchester' }, { id: 'd', text: 'Keep airspace above 50%', kind: 'airspace', n: 50 }] },
]
export const MISSION_MAP: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]))

export function setupMission(st: GameState) {
  const m = st.cfg.mission ? MISSION_MAP[st.cfg.mission] : undefined; if (!m) return
  st.flags.shiftSec = m.minutes * 60
  st.objectives = m.objectives.map((o) => ({ id: o.id, text: o.text, done: false, failed: false }))
  say(st, { channel: 'OPS', from: 'COMMANDER', to: 'ALL', text: `${m.title.replace(/^\d+ · /, '')}. ${m.brief[0]}`, voice: 'OPS', sev: 'PRIORITY' })
}
function spawnVip(st: GameState, from: string, to: string) {
  const d = planDraft(st, 'BIZ'); if (!d) return
  d.dep = from; d.arr = to; d.route = routeBetween(from, to); d.callsign = 'VIP01'; d.rfl = 31000; d.remarks = 'VIP FLIGHT'
  const plan = fileFlight(st, d, st.t - 1)
  const ac = launchFlight(st, plan, 0)
  st.flags.vipId = ac.id; st.flags.vipSpawned = true; st.flags.vipEscort = 0
}
export function missionStep(st: GameState) {
  const m = st.cfg.mission ? MISSION_MAP[st.cfg.mission] : undefined; if (!m || st.ended) return
  const el = st.t - st.startT
  m.events.forEach((ev, i) => {
    if (st.flags['mev:' + i] || el < ev.at * 60) return
    st.flags['mev:' + i] = true
    if (ev.raid) { const { size, type, ...o } = ev.raid; o.dist ??= st.rng.range(150, 185); if (o.vip) o.vip = st.flags.vipId as string; spawnRaid(st, size, type, o) }
    if (ev.allied) spawnAllied(st)
    if (ev.event) spawnEvent(st, ev.event)
    if (ev.vip) spawnVip(st, ev.vip.from, ev.vip.to)
    if (ev.say) say(st, { channel: 'OPS', from: 'COMMANDER', to: 'ALL', text: ev.say, voice: 'OPS', sev: 'PRIORITY' })
  })
  // VIP escort time
  const vipId = st.flags.vipId as string | undefined
  if (vipId && st.aircraft[vipId] && Object.values(st.ops).some((o) => o.type === 'SHADOW' && o.status === 'ACTIVE' && o.entityId === vipId && o.stage === 4)) st.flags.vipEscort = ((st.flags.vipEscort as number) ?? 0) + 1
  const end = el >= m.minutes * 60
  let hardFail = false
  m.objectives.forEach((def, i) => {
    const o: Objective = st.objectives[i]; if (!o || o.failed) return
    switch (def.kind) {
      case 'protect': if (st.flags['breach:' + def.target]) { o.failed = true; o.done = false; hardFail = true } else o.done = end; break
      case 'splash': o.done = st.splashes >= (def.n ?? 1); if (end && !o.done) o.failed = true; break
      case 'decoys': o.done = ((st.flags.decoysFound as number) ?? 0) >= (def.n ?? 1); if (end && !o.done) o.failed = true; break
      case 'ids': o.done = st.score.idCorrect >= (def.n ?? 1); if (end && !o.done) o.failed = true; break
      case 'airspace': if (st.airspace < (def.n ?? 0)) { o.failed = true; o.done = false } else o.done = end; break
      case 'vipEscort': o.done = ((st.flags.vipEscort as number) ?? 0) >= (def.n ?? 600); if (end && !o.done) o.failed = true; break
      case 'vipSafe': if (st.flags.vipHit) { o.failed = true; hardFail = true } else if (st.flags.vipSpawned && !st.aircraft[vipId ?? '']) o.done = true; else if (end) o.failed = true; break
      case 'survive': o.done = end && st.airspace > 0; break
    }
  })
  if (hardFail && !st.ended) { st.ended = true; st.flags.result = 'FAILED' }
  else if (end && !st.ended) { st.ended = true; st.flags.result = st.objectives.every((o) => o.done) ? 'COMPLETE' : 'FAILED' }
}
/** Stars: 1 = all objectives, 2 = and airspace ≥ 75%, 3 = and overall score ≥ 80. */
export function missionStars(st: GameState, overall: number) {
  if (!st.objectives.length || !st.objectives.every((o) => o.done)) return 0
  return 1 + (st.airspace >= 75 ? 1 : 0) + (st.airspace >= 75 && overall >= 80 ? 1 : 0)
}

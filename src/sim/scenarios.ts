import { AIRPORT_MAP } from './data/airports'
import { spawnEvent, bumpTension } from './events'
import { computeScores } from './scoring'
import { fmtHM, distNm } from './geo'
import { say } from './comms'
import type { GameState, Objective } from './types'

export const markUi = (st: GameState, name: string) => { st.flags['ui:' + name] = true }
const ui = (st: GameState, n: string) => !!st.flags['ui:' + n]
const val = (st: GameState, n: string) => (st.flags[n] as number) ?? 0

export interface ObjDef { id: string; text: string; test: (st: GameState) => boolean; fail?: (st: GameState) => boolean; optional?: boolean }
export interface ScenarioDef {
  id: string; title: string; kind: 'TRADE' | 'BASIC'; brief: string[]; limitMin: number; unlock?: string
  cfg: { traffic: number; weather: 'CLEAR' | 'RAIN' | 'STORM'; hour: number; seed: number; complexity: number; radarOff?: string[]; incidents?: boolean; intel?: boolean; radarFaults?: boolean; tension0?: number }
  setup: (st: GameState) => void
  objectives: ObjDef[]
  mentor: string[]
}
const near = {
  eastSea: [{ lat: 54.6, lon: 3.2 }, { lat: 56.2, lon: 2.4 }, { lat: 53.0, lon: 3.4 }],
  irishSea: [{ lat: 53.8, lon: -5.5 }, { lat: 52.2, lon: -6.6 }],
  channel: [{ lat: 50.4, lon: -0.4 }, { lat: 50.1, lon: -3.0 }],
}
const handled = (st: GameState) => st.incidents.length > 0 && st.incidents.every((i) => i.closed !== null)
const incOk = (st: GameState, kind: string) => st.incidents.some((i) => i.kind === kind && i.status === 'RESOLVED')

export const SCENARIOS: ScenarioDef[] = [
  { id: 'T1', title: 'T1 · FIRST CONTACT', kind: 'TRADE', limitMin: 40,
    brief: ['Three aircraft have been detected approaching the east coast with no filed flight plan.', 'Establish who they are: compare squawk, flight plan, registry and ATC information before you classify.', 'Do not classify without evidence.'],
    cfg: { traffic: 0.5, weather: 'CLEAR', hour: 9, seed: 4101, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { for (const p of [...near.eastSea, near.irishSea[0]].slice(0, 3)) spawnEvent(st, 'strayed', { start: p }); spawnEvent(st, 'missing') },
    objectives: [
      { id: 'a', text: 'Classify 3 contacts correctly', test: (st) => st.score.idCorrect >= 3 },
      { id: 'b', text: 'No misidentifications', test: (st) => st.score.idWrong === 0 && st.score.idCorrect >= 3, fail: (st) => st.score.idWrong > 0 },
      { id: 'c', text: 'Use the ATC query or registry at least twice', test: (st) => Object.values(st.tracks).filter((t) => t.checks.atc || t.checks.registry).length >= 2, optional: true },
    ],
    mentor: ['Select a track and read the evidence table in the Track Detail panel. Red rows are conflicts.', 'No flight plan correlation? Try the ATC QUERY — area control may hold a plan the RAP does not.', 'Primary-only contacts have no squawk. Dispatch nothing yet: query ATC, then consider an IDENTIFY operation.'] },
  { id: 'T2', title: 'T2 · WATCHING THE GAP', kind: 'TRADE', limitMin: 60, unlock: 'T1',
    brief: ['Benbecula and Saxa Vord radars are offline for maintenance, leaving a gap over the Atlantic approaches.', 'A large foreign aircraft is expected to probe the gap.', 'Cover the gap with an E-3D patrol and make sure the contact is visually identified.'],
    cfg: { traffic: 0.7, weather: 'CLEAR', hour: 13, seed: 4102, complexity: 0.1, radarOff: ['BENB', 'SAXA'], incidents: false, intel: true, radarFaults: false },
    setup: (st) => { spawnEvent(st, 'foreign'); for (const a of Object.values(st.assets)) if (a.typeId === 'F3') a.readiness = a.readiness }, 
    objectives: [
      { id: 'a', text: 'Establish an AEW (E-3D) patrol west of Scotland', test: (st) => Object.values(st.ops).some((o) => (o.type === 'PATROL' || o.type === 'MONITOR') && st.assets[o.assets[0]]?.typeId === 'E3D' && o.stage >= 3) },
      { id: 'b', text: 'Visually identify the foreign aircraft', test: (st) => Object.values(st.tracks).some((t) => t.vid && st.aircraft[t.entityId]?.truth.intent === 'foreignState') || Object.values(st.incidents).some((i) => i.kind === 'FOREIGN_STATE' && i.status === 'RESOLVED'), fail: (st) => st.incidents.some((i) => i.kind === 'FOREIGN_STATE' && i.status === 'FAILED') },
      { id: 'c', text: 'No aircraft lost, no bingo events', test: (st) => st.score.bingoEvents === 0, optional: true },
    ],
    mentor: ['Radar coverage genuinely matters: check the System Status panel to see which stations are down.', 'Create a PATROL op with an E-3D at a point west of the Hebrides. It carries its own radar.', 'Once the contact appears, task an IDENTIFY with a Tornado F3 — it needs a track to intercept.'] },
  { id: 'T3', title: 'T3 · TANKER TRACK', kind: 'TRADE', limitMin: 75, unlock: 'T2',
    brief: ['A Tornado pair must maintain a combat air patrol off the north-east coast for an extended period.', 'The patrol will outlast the fighters\' fuel. Coordinate tanker support.'],
    cfg: { traffic: 0.5, weather: 'CLEAR', hour: 10, seed: 4103, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: () => {},
    objectives: [
      { id: 'a', text: 'Establish a PATROL (60 min) with a Tornado F3', test: (st) => Object.values(st.ops).some((o) => o.type === 'PATROL' && o.status !== 'ABORTED' && o.stage >= 3) },
      { id: 'b', text: 'Complete one REFUEL operation', test: (st) => Object.values(st.ops).some((o) => o.type === 'REFUEL' && o.status === 'COMPLETE') },
      { id: 'c', text: 'No bingo-fuel returns', test: (st) => st.score.bingoEvents === 0 && Object.values(st.ops).some((o) => o.type === 'REFUEL' && o.status === 'COMPLETE'), fail: (st) => st.score.bingoEvents > 1 },
    ],
    mentor: ['Fighters burn ~2.8 tonnes/hour at cruise. Watch fuel in the Assets panel.', 'REFUEL op: choose a tanker (VC10/TriStar) and an airborne receiver. The rendezvous point defaults to the midpoint.', 'Airborne fighters with an active PATROL op can still be topped up — the patrol resumes automatically.'] },
  { id: 'T4', title: 'T4 · ODD ONE OUT', kind: 'TRADE', limitMin: 45, unlock: 'T3',
    brief: ['Busy afternoon traffic. Surveillance suspects an aircraft is transmitting another flight\'s identity.', 'Find it by comparing sources — and do not accuse honest flights.'],
    cfg: { traffic: 1.3, weather: 'RAIN', hour: 14, seed: 4104, complexity: 0, incidents: false, intel: true, radarFaults: false },
    setup: (st) => { spawnEvent(st, 'cloned', { start: { lat: 55.2, lon: 3.5 } }); spawnEvent(st, 'deviation'); spawnEvent(st, 'xpdr') },
    objectives: [
      { id: 'a', text: 'Correctly classify the duplicate-identity aircraft SUSPICIOUS', test: (st) => val(st, 'susRight') >= 1 },
      { id: 'b', text: 'No false accusations', test: (st) => st.score.falseAlarms === 0 && val(st, 'susRight') >= 1, fail: (st) => st.score.falseAlarms >= 2 },
      { id: 'c', text: 'Resolve the weather deviation by ATC query', test: (st) => st.incidents.some((i) => i.kind === 'PLAN_DEVIATION' && i.status === 'RESOLVED'), optional: true },
    ],
    mentor: ['Look for tracks flagged DUPLICATE MODE S CALLSIGN or SQUAWK/CALLSIGN CONFLICT.', 'Run a REGISTRY check on each: the real flight matches, the impostor has the wrong ICAO address or performance.', 'A route deviation alone is not suspicious — ask ATC before you accuse.'] },
  { id: 'T5', title: 'T5 · THIN FUEL', kind: 'TRADE', limitMin: 90, unlock: 'T4',
    brief: ['Fuel stocks at the fighter bases are critically low after a long exercise.', 'Contacts need to be identified, but each launch burns fuel you cannot replace quickly.', 'Arrange a supply flight and prioritise.'],
    cfg: { traffic: 0.8, weather: 'CLEAR', hour: 7, seed: 4105, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { for (const icao of ['EGXE', 'EGQL', 'EGXC', 'EGQS']) { if (st.airfields[icao]) st.airfields[icao].fuelKg = 26000 } for (const p of near.eastSea.slice(0, 2)) spawnEvent(st, 'strayed', { start: p }) },
    objectives: [
      { id: 'a', text: 'Complete a SUPPLY flight delivering fuel', test: (st) => Object.values(st.ops).some((o) => o.type === 'SUPPLY' && o.status === 'COMPLETE' && o.cargo?.kind === 'FUEL') },
      { id: 'b', text: 'Identify both inbound contacts', test: (st) => st.score.idCorrect >= 2 },
      { id: 'c', text: 'Never lose an aircraft or suffer bingo', test: (st) => st.score.bingoEvents === 0, fail: (st) => Object.values(st.assets).some((a) => a.defect?.startsWith('LOST')) },
    ],
    mentor: ['Airfield fuel is finite — see the Airfields panel. Lyneham holds the strategic stock.', 'SUPPLY needs a Hercules on the ground at the SOURCE base. Cargo comes out of that base\'s stock.', 'ATC queries cost nothing. Use them before launching fighters at harmless aircraft.'] },
  { id: 'T6', title: 'T6 · MAYDAY', kind: 'TRADE', limitMin: 50, unlock: 'T5',
    brief: ['Three civil incidents will develop in quick succession: an engine failure, a radio failure and unlawful interference.', 'Acknowledge each, alert airfields and keep eyes on the aircraft until they land.'],
    cfg: { traffic: 1, weather: 'CLEAR', hour: 11, seed: 4106, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { st.scheduled.push({ at: st.t + 120, fn: 'scn-7700', args: [] }, { at: st.t + 600, fn: 'scn-7600', args: [] }, { at: st.t + 1100, fn: 'scn-7500', args: [] }) },
    objectives: [
      { id: 'a', text: '7700: alert the destination airfield before landing', test: (st) => incOk(st, 'EMERGENCY_7700') },
      { id: 'b', text: '7600: acknowledge the radio failure', test: (st) => st.incidents.some((i) => i.kind === 'COMMS_7600' && i.acked) },
      { id: 'c', text: '7500: acknowledge and shadow the aircraft', test: (st) => incOk(st, 'UNLAWFUL_7500'), fail: (st) => st.incidents.some((i) => i.kind === 'UNLAWFUL_7500' && i.status === 'FAILED') },
    ],
    mentor: ['Incident Log: select an incident, then ACK and ALERT AIRFIELD.', '7600 aircraft usually continue to destination. Just stay aware — acknowledge and monitor.', 'For 7500 task a SHADOW op on the track and alert the destination.'] },
  { id: 'T7', title: 'T7 · STORM WATCH', kind: 'TRADE', limitMin: 60, unlock: 'T6',
    brief: ['A severe storm system degrades the radar network. Equipment is failing.', 'Keep the picture alive: dispatch engineers where it matters most and identify what you can see.'],
    cfg: { traffic: 1, weather: 'STORM', hour: 16, seed: 4107, complexity: 0.1, incidents: false, intel: false, radarFaults: true },
    setup: (st) => { for (const r of st.radars) if (['PORT', 'BUCH'].includes(r.id)) { r.condition = 40; r.status = 'DEGRADED'; r.note = 'Storm damage' } st.scheduled.push({ at: st.t + 300, fn: 'scn-radar', args: [] }); spawnEvent(st, 'strayed', { start: near.channel[0] }) },
    objectives: [
      { id: 'a', text: 'Dispatch engineers and restore two degraded stations', test: (st) => val(st, 'repairs') >= 2 },
      { id: 'b', text: 'Identify the inbound contact', test: (st) => st.score.idCorrect >= 1 },
      { id: 'c', text: 'Nothing crosses undetected', test: (st) => st.score.undetected === 0, optional: true },
    ],
    mentor: ['System Status shows each radar. DISPATCH sends a team (you only have three) and takes the station offline while it works.', 'Weather cells attenuate primary radar — watch for tracks coasting.', 'Do not leave the whole picture reliant on one station.'] },
  { id: 'T8', title: 'T8 · FULL WATCH', kind: 'TRADE', limitMin: 60, unlock: 'T7',
    brief: ['A complete evening watch: traffic, incidents, intelligence and limited resources.', 'Finish with an overall performance of at least 70.'],
    cfg: { traffic: 1.2, weather: 'RAIN', hour: 18, seed: 4108, complexity: 0.9, incidents: true, intel: true, radarFaults: true, tension0: 0.4 },
    setup: () => {},
    objectives: [
      { id: 'a', text: 'Finish the watch with overall score ≥ 70', test: (st) => st.t - st.startT >= 3300 && computeScores(st).overall >= 70, fail: (st) => st.t - st.startT >= 3500 && computeScores(st).overall < 70 },
      { id: 'b', text: 'No aircraft lost', test: (st) => !Object.values(st.assets).some((a) => a.defect?.startsWith('LOST')) },
    ],
    mentor: ['Prioritise: emergencies first, then non-cooperative contacts, then uncorrelated tracks.', 'Check Airfields regularly — fuel and spares are what limit your options.', 'Intel can be wrong. Rate it, but verify against the picture.'] },
]
export const SCENARIO_MAP: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]))

// ---------------- Basic Training -------------------------------------------------------------
export interface Step { id: string; text: string; hint: string; done: (st: GameState) => boolean }
export interface Lesson { id: string; title: string; intro: string; steps: Step[]; setup: (st: GameState) => void; cfg: ScenarioDef['cfg'] }
const tr = (st: GameState) => Object.values(st.tracks).filter((t) => !t.dropped)
export const LESSONS: Lesson[] = [
  { id: 'L1', title: 'LESSON 1 · RADAR OPERATION', intro: 'Learn the radar display: scale, scroll, layers and the simulation clock.', cfg: { traffic: 0.6, weather: 'CLEAR', hour: 9, seed: 2001, complexity: 0, incidents: false, intel: false, radarFaults: false }, setup: () => {},
    steps: [
      { id: 'zoom', text: 'Zoom the display with the mouse wheel', hint: 'Roll the wheel over the radar picture.', done: (s) => ui(s, 'zoom') },
      { id: 'pan', text: 'Drag the picture to pan', hint: 'Hold the left button on empty radar space and drag.', done: (s) => ui(s, 'pan') },
      { id: 'range', text: 'Select a display range from the RANGE buttons', hint: 'Top bar: 50 / 100 / 200 / 400 / 800 NM.', done: (s) => ui(s, 'range') },
      { id: 'layer', text: 'Toggle the COVERAGE layer to see radar cover', hint: 'Layer buttons are on the top bar. Each station sweeps independently.', done: (s) => ui(s, 'layer:cov') },
      { id: 'select', text: 'Click an aircraft symbol to select it', hint: 'Symbols are squares, circles and clovers — click one.', done: (s) => ui(s, 'select') },
      { id: 'speed', text: 'Change the simulation speed (try 5x) then pause with SPACE', hint: 'Speed controls are in the top bar.', done: (s) => ui(s, 'speed') && ui(s, 'pause') },
    ] },
  { id: 'L2', title: 'LESSON 2 · AIRCRAFT IDENTIFICATION', intro: 'Two unidentified contacts are inbound. Establish what they are using multiple sources.', cfg: { traffic: 0.5, weather: 'CLEAR', hour: 9, seed: 2002, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { spawnEvent(st, 'strayed', { start: near.eastSea[0] }); spawnEvent(st, 'missing') },
    steps: [
      { id: 'unk', text: 'Select a track classified UNCORRELATED or UNKNOWN', hint: 'Yellow symbols. Use the TRACK LIST filter if needed.', done: (s) => ui(s, 'selectUnc') },
      { id: 'atc', text: 'Run an ATC QUERY on it', hint: 'Track Detail → ATC QUERY. Reply arrives in about 12 seconds of sim time.', done: (s) => tr(s).some((t) => t.checks.atc) },
      { id: 'reg', text: 'Run a REGISTRY check on a correlated track', hint: 'The registry compares Mode S address, type and performance.', done: (s) => tr(s).some((t) => t.checks.registry) },
      { id: 'cls', text: 'Declare a track IDENTIFIED once evidence agrees', hint: 'Evidence rows should be green. Press IDENTIFIED.', done: (s) => s.score.idCorrect >= 1 },
      { id: 'cls2', text: 'Identify a second contact', hint: 'Primary-only contacts may need a visual ID — task an IDENTIFY op, or ask ATC.', done: (s) => s.score.idCorrect >= 2 },
    ] },
  { id: 'L3', title: 'LESSON 3 · FLIGHT PLANS', intro: 'Flight plans are the baseline of the picture. Deviations from them are what matter.', cfg: { traffic: 0.8, weather: 'CLEAR', hour: 10, seed: 2003, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { spawnEvent(st, 'deviation') },
    steps: [
      { id: 'panel', text: 'Open the FLIGHT PLANS panel', hint: 'Use the PANELS menu in the top bar.', done: (s) => ui(s, 'panel:plans') },
      { id: 'sel', text: 'Select a flight plan from the list', hint: 'Click a row; the corresponding aircraft is highlighted.', done: (s) => ui(s, 'planSelect') },
      { id: 'search', text: 'Search the REGISTRY tab for a registration', hint: 'Type an operator name such as BRITISH in the registry search.', done: (s) => ui(s, 'registrySearch') },
      { id: 'dev', text: 'Find a track flagged ROUTE DEVIATION', hint: 'Open the Track List and sort by flags — or watch for the Incident Log alert.', done: (s) => tr(s).some((t) => t.flags.some((f) => f.startsWith('ROUTE DEV'))) && ui(s, 'selectFlag') },
      { id: 'resolve', text: 'Ask ATC about the deviating aircraft', hint: 'A deviation is not automatically suspicious — weather is common.', done: (s) => s.incidents.some((i) => i.kind === 'PLAN_DEVIATION' && i.status === 'RESOLVED') },
    ] },
  { id: 'L4', title: 'LESSON 4 · COMMUNICATIONS & INTELLIGENCE', intro: 'Every message comes from something that really happened in the simulation.', cfg: { traffic: 0.8, weather: 'CLEAR', hour: 11, seed: 2004, complexity: 0, incidents: false, intel: true, radarFaults: false },
    setup: (st) => { spawnEvent(st, '7600'); st.scheduled.push({ at: st.t + 90, fn: 'scn-intel', args: [] }) },
    steps: [
      { id: 'comms', text: 'Open the COMMS panel', hint: 'PANELS menu → COMMS.', done: (s) => ui(s, 'panel:comms') },
      { id: 'search', text: 'Search the communications history for "7600"', hint: 'Type in the search box at the top of COMMS.', done: (s) => ui(s, 'commsSearch') },
      { id: 'ack', text: 'Acknowledge the radio-failure incident', hint: 'Incident Log → select → ACK.', done: (s) => s.incidents.some((i) => i.kind === 'COMMS_7600' && i.acked) },
      { id: 'voice', text: 'Toggle the voice (VOX) mute button', hint: 'Speaker button in the top bar.', done: (s) => ui(s, 'audio') },
      { id: 'intel', text: 'Assess an intelligence report', hint: 'INTELLIGENCE panel → CREDIBLE / DOUBTFUL / DISREGARD.', done: (s) => s.intel.some((i) => i.assessed) },
    ] },
  { id: 'L5', title: 'LESSON 5 · ASSET MANAGEMENT', intro: 'Task a Tornado to identify an unknown, then manage its recovery and the airfield\'s resources.', cfg: { traffic: 0.5, weather: 'CLEAR', hour: 12, seed: 2005, complexity: 0, incidents: false, intel: false, radarFaults: false },
    setup: (st) => { spawnEvent(st, 'strayed', { start: near.eastSea[1] }) },
    steps: [
      { id: 'panel', text: 'Open the ASSETS panel', hint: 'PANELS menu → ASSETS.', done: (s) => ui(s, 'panel:assets') },
      { id: 'airfields', text: 'Open the AIRFIELDS panel and review fuel stocks', hint: 'Fuel and spares are finite.', done: (s) => ui(s, 'panel:airfields') },
      { id: 'op', text: 'Task an IDENTIFY operation on the unknown contact', hint: 'Select the track → IDENTIFY in Track Detail, or use the ACTIVE OPS panel.', done: (s) => Object.values(s.ops).some((o) => o.type === 'IDENTIFY') },
      { id: 'vid', text: 'Wait for the visual identification report', hint: 'Use 5x speed. Stages: launch, transit, intercept, visual ID.', done: (s) => tr(s).some((t) => !!t.vid) },
      { id: 'rtb', text: 'Let the Tornado return to base and complete the operation', hint: 'The op completes when the aircraft lands.', done: (s) => s.score.opsCompleted >= 1 },
    ] },
]
export const LESSON_MAP: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l]))
export function currentStep(st: GameState): { lesson: Lesson; index: number; step: Step | null } | null {
  const l = st.cfg.scenarioId ? LESSON_MAP[st.cfg.scenarioId] : null
  if (!l) return null
  for (let i = 0; i < l.steps.length; i++) {
    const s = l.steps[i]
    if (!st.flags['step:' + s.id]) { if (s.done(st)) st.flags['step:' + s.id] = true; else return { lesson: l, index: i, step: s } }
  }
  return { lesson: l, index: l.steps.length, step: null }
}

export function setupScenario(st: GameState) {
  const cfg = st.cfg
  if (cfg.mode === 'INSTANT') {
    const r = st.rng
    spawnEvent(st, 'strayed', { start: { lat: 54.8, lon: 3.0 } }); spawnEvent(st, 'strayed', { start: { lat: 52.2, lon: -7.2 } })
    spawnEvent(st, 'foreign'); spawnEvent(st, '7700'); spawnEvent(st, 'missing'); spawnEvent(st, 'deviation')
    const rd = st.radars.find((x) => x.id === 'PORT'); if (rd) { rd.condition = 48; rd.status = 'DEGRADED'; rd.note = 'Equipment condition poor' }
    st.tension = cfg.tension0 = 0.55
    void r
  }
  const sc = cfg.scenarioId
  if (sc && SCENARIO_MAP[sc]) {
    const d = SCENARIO_MAP[sc]; d.setup(st)
    st.objectives = d.objectives.map((o) => ({ id: o.id, text: o.text, done: false, failed: false, optional: o.optional }))
    st.flags.limit = d.limitMin * 60
  }
  if (cfg.mode === 'BASIC' && sc && LESSON_MAP[sc]) LESSON_MAP[sc].setup(st)
  if (cfg.mode === 'INSTANT') st.flags.limit = 45 * 60
  if (cfg.mode === 'INSTANT') st.objectives = [
    { id: 'a', text: 'Resolve all opening incidents', done: false, failed: false }, { id: 'b', text: 'No misidentifications', done: false, failed: false, optional: true }, { id: 'c', text: 'Survive the watch (45 min) with overall ≥ 60', done: false, failed: false },
  ]
  if (cfg.mode === 'COMBAT') st.objectives = [{ id: 'a', text: 'Maintain an accurate Recognised Air Picture', done: false, failed: false, optional: true }, { id: 'b', text: 'Keep every incident handled', done: false, failed: false, optional: true }]
  say(st, { channel: 'OPS', from: 'WATCH SUPERVISOR', to: 'ALL', text: `Watch commencing ${fmtHM(st.t)}Z. Radar network ${st.radars.filter((r) => r.status === 'OPERATIONAL' && !r.airborne).length} of 8 stations operational.`, voice: 'OPS', speak: false })
}

export function scenarioScheduled(st: GameState, fn: string) {
  if (fn === 'scn-7700') spawnEvent(st, '7700')
  else if (fn === 'scn-7600') spawnEvent(st, '7600')
  else if (fn === 'scn-7500') spawnEvent(st, '7500')
  else if (fn === 'scn-radar') spawnEvent(st, 'radar')
  else if (fn === 'scn-intel') spawnEvent(st, 'noise')
}

/** Evaluate objectives & end conditions. */
export function evaluateObjectives(st: GameState) {
  const sc = st.cfg.scenarioId ? SCENARIO_MAP[st.cfg.scenarioId] : null
  // repairs counter for T7
  for (const r of st.radars) if (r.status === 'OPERATIONAL' && st.flags['wasMaint:' + r.id]) { st.flags['wasMaint:' + r.id] = false; st.flags.repairs = val(st, 'repairs') + 1 } else if (r.status === 'MAINTENANCE') st.flags['wasMaint:' + r.id] = true
  const elapsed = st.t - st.startT
  if (sc) {
    sc.objectives.forEach((def, i) => {
      const o: Objective = st.objectives[i]; if (o.done || o.failed) return
      if (def.test(st)) o.done = true; else if (def.fail?.(st)) o.failed = true
    })
    const req = st.objectives.filter((o) => !o.optional)
    if (!st.ended) {
      if (req.every((o) => o.done)) { st.ended = true; st.flags.result = 'SUCCESS' }
      else if (req.some((o) => o.failed)) { st.ended = true; st.flags.result = 'FAILED' }
      else if (elapsed >= (st.flags.limit as number)) { st.ended = true; st.flags.result = 'TIME' }
    }
  } else if (st.cfg.mode === 'INSTANT') {
    const o = st.objectives
    if (st.incidents.length >= 4 && st.incidents.slice(0, 6).every((i) => i.closed !== null)) o[0].done = true
    o[1].done = st.score.idWrong === 0 && elapsed > 600; o[1].failed = st.score.idWrong > 0
    if (elapsed >= (st.flags.limit as number) && !st.ended) { o[2].done = computeScores(st).overall >= 60; o[2].failed = !o[2].done; st.ended = true; st.flags.result = o[2].done ? 'SUCCESS' : 'FAILED' }
  } else if (st.cfg.mode === 'COMBAT') {
    const o = st.objectives
    o[0].done = st.score.idWrong === 0 && st.score.unknownLapse < 1 && elapsed > 1800; o[0].failed = st.score.idWrong > 1
    o[1].done = st.score.incidentsFailed === 0 && st.score.incidentsTotal > 2; o[1].failed = st.score.incidentsFailed > 1
  }
  if (st.cfg.mode === 'BASIC') {
    const cs = currentStep(st)
    if (cs && !cs.step && !st.ended) { st.ended = true; st.flags.result = 'SUCCESS' }
  }
}
export function mentorHint(st: GameState): string | null {
  const cs = currentStep(st)
  if (cs?.step) return cs.step.hint
  const sc = st.cfg.scenarioId ? SCENARIO_MAP[st.cfg.scenarioId] : null
  // contextual rules in priority order
  const openInc = st.incidents.find((i) => i.closed === null && !i.acked)
  if (openInc) return `Incident ${openInc.id} (${openInc.title}) is unacknowledged. Select it in the Incident Log and press ACK. Needs: ${openInc.needs}.`
  const low = Object.values(st.assets).find((a) => a.status === 'AIRBORNE' && a.ac && a.lowWarned)
  if (low) return `${low.callsign} is approaching bingo fuel. Arrange a REFUEL op, or let it return — bingo returns count against resource management.`
  const rd = st.radars.find((r) => !r.airborne && (r.status === 'DEGRADED' || r.status === 'OFFLINE') && !r.forcedOffline)
  if (rd) return `${rd.name} is ${rd.status.toLowerCase()}. Dispatch engineers from System Status, and consider covering the gap with an AEW patrol.`
  const unk = tr(st).find((t) => (t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' || t.category === 'UNRESOLVED') && !t.manual)
  if (unk) return `Track ${unk.id} is ${unk.category}. Compare its squawk, Mode S and flight plan in Track Detail, then try ATC QUERY and REGISTRY before classifying.`
  const af = Object.values(st.airfields).find((a) => a.fuelKg / a.fuelCap < 0.2)
  if (af) return `${af.name} fuel is below 20%. Plan a SUPPLY flight with a Hercules before launches are restricted.`
  const pending = sc ? st.objectives.find((o) => !o.done && !o.optional) : null
  if (sc && pending) { const i = st.objectives.indexOf(pending); return sc.mentor[i % sc.mentor.length] }
  return 'Picture is stable. Scan the Track List for flags, review Airfields, and keep an AEW patrol over coverage gaps.'
}
void AIRPORT_MAP; void distNm; void bumpTension

import { Rng } from './rng'
import type { Category, GameConfig, GameState, OpType } from './types'
import { initWeather, tickWeather } from './weather'
import { initAirfields, recoverAsset, stepAssets } from './assets'
import { makeRadars, maintainTracks, stepRadars } from './radar'
import { stepSensors } from './sensors'
import { stepAircraft } from './aircraft'
import { airborneCivil, fileFlight, launchFlight, planDraft, plansPending, populate, targetCount } from './traffic'
import { classifyTracks, declare, inADIZ, interrogate, queryAtc, queryRegistry, runScheduled } from './identification'
import { abortOp, createOp, stepOps, type OpSpec } from './operations'
import { ackIncident } from './incidents'
import { assessIntel, directorStep, dispatchEngineers, eventScheduled, monitorIncidents, notifyAirfield, spawnEvent, stepRadarHealth } from './events'
import { newLedger } from './scoring'
import { say, rt } from './comms'
import { evaluateObjectives, scenarioScheduled, setupScenario } from './scenarios'

export type Command =
  | { c: 'declare'; trackId: string; cat: Category | 'CLEAR' | 'CLUTTER' }
  | { c: 'registry'; trackId: string } | { c: 'atc'; trackId: string } | { c: 'interrogate'; trackId: string }
  | { c: 'ack'; incidentId: string } | { c: 'alertAirfield'; incidentId: string }
  | { c: 'op'; spec: OpSpec } | { c: 'abortOp'; opId: string }
  | { c: 'readiness'; assetId: string; state: 'R5' | 'R30' | 'R60' }
  | { c: 'engineers'; radarId: string; kind: 'REPAIR' | 'PM' }
  | { c: 'intel'; id: string; verdict: 'CREDIBLE' | 'DOUBTFUL' | 'DISREGARD'; trackId?: string }
  | { c: 'watch'; trackId: string; on: boolean }
  | { c: 'spawn'; event: string }
  | { c: 'closeAirfield'; icao: string; open: boolean }

export const defaultConfig = (over: Partial<GameConfig> = {}): GameConfig => ({
  mode: 'COMBAT', seed: 1998, startHour: 6, traffic: 1, weather: 'CLEAR', complexity: 0.6, radarOff: [], incidents: true, tension0: 0.03, prepSeconds: 0, maxAssetsDown: 0, growth: true,
  assetsEnabled: true, radarFaults: true, intel: true, fastStart: false, ...over,
})

export function createState(cfg: GameConfig): GameState {
  const startT = cfg.startHour * 3600
  const st: GameState = {
    t: startT, startT, tick: 0, cfg, rng: new Rng(cfg.seed), nextId: 0, aircraft: {}, plans: {}, squawkInUse: new Set(), tracks: {}, trackByEntity: {}, trackNum: 0,
    radars: [], weather: null as never, assets: {}, airfields: {}, ops: {}, messages: [], intel: [], incidents: [], score: newLedger(), tension: cfg.tension0,
    engineersFree: 3, engineersTotal: 3, nextSpawn: 0, nextEvent: startT + (cfg.mode === 'INSTANT' ? 20 : 420), nextIntel: startT + 600, scheduled: [], pending: [], events: [], ended: false, paused: false,
    objectives: [], flags: {}, stats: { spawned: 0, removed: 0, maxTracks: 0 },
  }
  st.weather = initWeather(st)
  initAirfields(st)
  st.radars = makeRadars(st)
  populate(st, Math.round(78 * cfg.traffic * (0.35 + 0.65 * 0.8)))
  setupScenario(st)
  // let the initial picture build (a few sweeps) without advancing the clock
  return st
}

export class SimEngine {
  st: GameState
  constructor(cfg: GameConfig) { this.st = createState(cfg) }
  dispatch(cmd: Command): string | null { return dispatch(this.st, cmd) }
  step(n = 1) { for (let i = 0; i < n; i++) tick(this.st) }
  /** Warm-up: run silently so radar tracks exist when the watch begins. */
  warm(seconds: number) { for (let i = 0; i < seconds; i++) tick(this.st); this.st.t = this.st.startT; this.st.tick = 0; this.st.events.length = 0; this.st.messages.length = 0
    for (const tr of Object.values(this.st.tracks)) { tr.created = this.st.t; tr.unknownSince = tr.unknownSince === null ? null : this.st.t }
    this.st.score = newLedger(); this.st.incidents = []; this.st.pending = this.st.pending.filter(() => true) }
}

export function dispatch(st: GameState, cmd: Command): string | null {
  switch (cmd.c) {
    case 'declare': declare(st, cmd.trackId, cmd.cat); return null
    case 'registry': queryRegistry(st, cmd.trackId); return null
    case 'atc': queryAtc(st, cmd.trackId); return null
    case 'interrogate': interrogate(st, cmd.trackId); return null
    case 'ack': ackIncident(st, cmd.incidentId); return null
    case 'alertAirfield': notifyAirfield(st, cmd.incidentId); return null
    case 'op': { const r = createOp(st, cmd.spec); if (!r.ok) { say(st, { channel: 'OPS', from: 'SYSTEM', to: 'OPS', text: `Tasking rejected: ${r.error}`, voice: 'SYSTEM', sev: 'PRIORITY', speak: false }); return r.error } st.events.push({ type: 'ui', name: 'opCreated:' + r.id }); return null }
    case 'abortOp': abortOp(st, cmd.opId); return null
    case 'readiness': { const a = st.assets[cmd.assetId]; if (a) a.readiness = cmd.state; return null }
    case 'engineers': return dispatchEngineers(st, cmd.radarId, cmd.kind)
    case 'intel': assessIntel(st, cmd.id, cmd.verdict, cmd.trackId); return null
    case 'watch': { const t = st.tracks[cmd.trackId]; if (t) t.watch = cmd.on; return null }
    case 'spawn': spawnEvent(st, cmd.event); return null
    case 'closeAirfield': { const af = st.airfields[cmd.icao]; if (af) { af.open = cmd.open; af.closedReason = cmd.open ? '' : 'Closed by operations' } return null }
  }
}

function closeFlight(st: GameState, id: string, why: 'landed' | 'exited') {
  const ac = st.aircraft[id]; if (!ac) return
  const plan = ac.planId ? st.plans[ac.planId] : null
  if (plan) { plan.status = 'CLOSED'; plan.aircraftId = null; st.squawkInUse.delete(plan.squawk) }
  delete st.aircraft[id]; st.stats.removed++
  if (why === 'exited' && plan && ac.role === 'AIRLINER' && st.stats.removed % 3 === 0) say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text: `${rt(ac)} transferred to adjacent centre, leaving surveillance area.`, voice: 'CONTROLLER', speak: false, ref: ac.id })
}

export function tick(st: GameState) {
  const dt = 1
  st.t += dt; st.tick++
  // --- civil scheduling
  for (const p of Object.values(st.plans)) if (p.status === 'FILED' && p.etd <= st.t) {
    launchFlight(st, p, 0)
    if (st.tick > 5 && st.stats.spawned % 4 === 0 && p.role === 'AIRLINER') say(st, { channel: 'ATC', from: 'AREA CONTROL', to: 'OPS', text: `${p.callsign} ${p.dep}-${p.arr} ${p.typeId} airborne/entering, FL${Math.round(p.rfl / 100)}, squawk ${p.squawk}.`, voice: 'CONTROLLER', speak: false, ref: p.id })
  }
  if (st.tick % 3 === 0) {
    const want = targetCount(st)
    const have = airborneCivil(st) + plansPending(st) * 0.4
    if (have < want && st.rng.chance(Math.min(0.9, (want - have) / 28 + want / 3300 * 3))) { const d = planDraft(st); if (d) fileFlight(st, d, st.t + st.rng.range(120, 1500)) }
  }
  // --- movement
  for (const ac of Object.values(st.aircraft)) {
    if (ac.deviateAt && ac.kind === 'phenomenon' && st.t > ac.deviateAt) { delete st.aircraft[ac.id]; continue }
    const r = stepAircraft(st, ac, dt)
    if (r === 'landed') {
      if (ac.kind === 'asset') recoverAsset(st, st.assets[ac.id], ac.nav.dest!)
      else closeFlight(st, ac.id, 'landed')
    } else if (r === 'exited') closeFlight(st, ac.id, 'exited')
  }
  stepAssets(st, dt)
  stepOps(st, dt)
  if (st.tick % 5 === 0) tickWeather(st, 5)
  // --- surveillance
  stepRadars(st, dt)
  stepSensors(st)
  maintainTracks(st)
  classifyTracks(st)
  if (st.tick % 10 === 0) stepRadarHealth(st)
  // --- events and incidents
  directorStep(st)
  monitorIncidents(st)
  runScheduled(st, (fn, args) => { eventScheduled(st, fn, args); scenarioScheduled(st, fn) })
  // --- bookkeeping
  if (st.tick % 5 === 0) {
    let live = 0
    for (const tr of Object.values(st.tracks)) {
      if (tr.dropped) continue
      live++
    }
    st.stats.maxTracks = Math.max(st.stats.maxTracks, live)
    // clean old plans / intel noise
    if (st.tick % 600 === 0) for (const [id, p] of Object.entries(st.plans)) if (p.status === 'CLOSED' && st.t - p.eta > 5400) delete st.plans[id]
    for (const af of Object.values(st.airfields)) if (af.alert && st.t > af.alert.until) af.alert = null
    if (st.cfg.intel && st.t >= st.nextIntel && st.cfg.incidents) { spawnEvent(st, 'noise'); st.nextIntel = st.t + st.rng.range(900, 2400) / (0.5 + st.tension) }
    evaluateObjectives(st)
  }
}

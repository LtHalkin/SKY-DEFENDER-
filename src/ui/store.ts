import { useEffect, useSyncExternalStore } from 'react'
import { SimEngine, defaultConfig, type Command } from '../sim/engine'
import type { GameConfig, GameState } from '../sim/types'
import { markUi, SCENARIO_MAP, LESSON_MAP } from '../sim/scenarios'
import { computeScores } from '../sim/scoring'
import { audio } from './audio'
import { loadProfile, saveProfile, type Profile } from './profile'

export type Screen = 'MENU' | 'SANDBOX' | 'TRAINING' | 'TRADE' | 'RECORDS' | 'BRIEFING' | 'GAME' | 'DEBRIEF'
export interface Layers { coast: boolean; borders: boolean; airways: boolean; fixes: boolean; airports: boolean; regions: boolean; zones: boolean; coverage: boolean; sweeps: boolean; rings: boolean; weather: boolean; trails: boolean; labels: boolean; grid: boolean }
export interface View { lat: number; lon: number; rangeNm: number }
export type PickMode = null | { kind: 'point'; label: string; cb: (p: { lat: number; lon: number }) => void } | { kind: 'measure'; a?: { lat: number; lon: number } }
export const DEFAULT_LAYERS: Layers = { coast: true, borders: true, airways: true, fixes: true, airports: true, regions: true, zones: true, coverage: false, sweeps: true, rings: true, weather: true, trails: true, labels: true, grid: true }

class Store {
  engine: SimEngine | null = null
  screen: Screen = 'MENU'
  cfg: GameConfig | null = null
  view: View = { lat: 54.6, lon: -4, rangeNm: 380 }
  layers: Layers = { ...DEFAULT_LAYERS }
  speed = 1; paused = false
  sel: { track?: string; incident?: string; asset?: string; op?: string; plan?: string; radar?: string; airfield?: string } = {}
  pick: PickMode = null
  ringOrigin = 'BOUL'
  profile: Profile = loadProfile()
  version = 0
  listeners = new Set<() => void>()
  banner: { text: string; sev: number; until: number } | null = null
  opsDraft: Record<string, any> = {}
  debrief: { scores: ReturnType<typeof computeScores>; st: GameState; result: string } | null = null
  panelRequest: string | null = null
  private raf = 0; private last = 0; private acc = 0; private lastNotify = 0
  stepMsg = ''

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getVersion = () => this.version
  notify() { this.version++; this.listeners.forEach((l) => l()) }
  get st(): GameState | null { return this.engine?.st ?? null }

  setScreen(s: Screen) { this.screen = s; this.notify() }
  applyProfileAudio() { const s = this.profile.settings; audio.volume = s.volume; audio.voiceOn = s.voice; audio.sfxOn = s.sfx }

  start(cfg: GameConfig) {
    audio.unlock(); this.applyProfileAudio(); audio.stopAll()
    this.cfg = cfg
    const e = new SimEngine(cfg); e.warm(150)
    this.engine = e; this.paused = false; this.speed = 1; this.sel = {}; this.pick = null; this.banner = null; this.debrief = null
    this.view = { lat: 55.2, lon: -2.5, rangeNm: cfg.mode === 'BASIC' ? 300 : 330 }
    this.layers = { ...DEFAULT_LAYERS }
    this.screen = 'GAME'; this.acc = 0; this.last = performance.now()
    cancelAnimationFrame(this.raf); this.loop(this.last)
    this.notify()
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; audio.stopAll() }
  dispatch(cmd: Command): string | null {
    if (!this.engine) return null
    const r = this.engine.dispatch(cmd)
    this.drainEvents(); this.notify(); return r
  }
  ui(name: string) { if (this.st) markUi(this.st, name) }
  setSpeed(n: number) { this.speed = n; this.paused = false; this.ui('speed'); this.notify() }
  togglePause() { this.paused = !this.paused; this.ui('pause'); this.notify() }
  stepOnce(n: number) { this.engine?.step(n); this.paused = true; this.drainEvents(); this.notify() }
  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const st = this.st; if (!st || this.screen !== 'GAME') { this.last = now; return }
    const dtr = Math.min(0.25, (now - this.last) / 1000); this.last = now
    if (!this.paused && !st.ended) {
      this.acc += dtr * this.speed
      let n = Math.floor(this.acc); this.acc -= n
      n = Math.min(n, 90)
      if (n > 0) this.engine!.step(n)
    }
    this.drainEvents()
    if (st.ended && this.screen === 'GAME') this.finish()
    if (now - this.lastNotify > 250) { this.lastNotify = now; this.notify() }
  }
  drainEvents() {
    const st = this.st; if (!st) return
    if (!st.events.length) return
    for (const ev of st.events.splice(0)) {
      if (ev.type === 'msg') { audio.speak(ev.msg); if (ev.msg.sev === 'URGENT') audio.warble(); else if (ev.msg.channel === 'INTEL') audio.chime() }
      else if (ev.type === 'alert') { this.banner = { text: ev.text, sev: ev.sev, until: performance.now() + 7000 }; if (ev.sev >= 3) audio.alarm(); else audio.chime() }
      else if (ev.type === 'emergency') { audio.alarm() }
      else if (ev.type === 'newTrack') { if (st.tick > 0) audio.newContact() }
    }
  }
  endWatch() { if (this.st) { this.st.ended = true; if (!this.st.flags.result) this.st.flags.result = 'ENDED' } this.finish() }
  finish() {
    const st = this.st; if (!st || this.screen === 'DEBRIEF') return
    const scores = computeScores(st)
    const result = (st.flags.result as string) ?? 'ENDED'
    this.debrief = { scores, st, result }
    const p = this.profile
    const m = st.cfg.mode
    const key = m === 'TRADE' || m === 'BASIC' ? st.cfg.scenarioId ?? m : m
    const rec = p.records[m] ?? { watches: 0, best: 0, bestGrade: '-', simHours: 0 }
    rec.watches++; rec.simHours += (st.t - st.startT) / 3600
    if (scores.overall > rec.best) { rec.best = scores.overall; rec.bestGrade = scores.grade }
    p.records[m] = rec; p.totals.watches++; p.totals.idCorrect += Math.floor(st.score.idCorrect); p.totals.incidentsHandled += Math.floor(st.score.incidentsHandled)
    if (m === 'TRADE' && st.cfg.scenarioId) { const prev = p.tradeBest[key]; if (!prev || scores.overall > prev.score) p.tradeBest[key] = { grade: scores.grade, score: scores.overall, result } }
    if (m === 'BASIC' && st.cfg.scenarioId && result === 'SUCCESS' && !p.lessonsDone.includes(st.cfg.scenarioId)) p.lessonsDone.push(st.cfg.scenarioId)
    saveProfile(p)
    this.paused = true; this.screen = 'DEBRIEF'; this.notify()
  }
  select(trackId?: string) { this.sel.track = trackId; this.stepMsg = ''; if (trackId) { this.ui('select'); const t = this.st?.tracks[trackId]; if (t && (t.category === 'UNCORRELATED' || t.category === 'UNKNOWN')) this.ui('selectUnc'); if (t && t.flags.some((f) => f.startsWith('ROUTE DEV'))) this.ui('selectFlag') } this.notify() }
  centreOn(p: { lat: number; lon: number }, range?: number) { this.view = { ...this.view, lat: p.lat, lon: p.lon, rangeNm: range ?? this.view.rangeNm }; this.notify() }
  toggleLayer(k: keyof Layers) { this.layers[k] = !this.layers[k]; this.ui('layer:' + (k === 'coverage' ? 'cov' : k)); this.notify() }
  requestPanel(id: string) { this.panelRequest = id; this.notify() }
}
export const store = new Store()
if (typeof window !== 'undefined') (window as any).__sd = store

export function useStore<T>(sel: (s: Store) => T): T {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return sel(store)
}
export function useGameTick() { useSyncExternalStore(store.subscribe, store.getVersion) }
export { defaultConfig, SCENARIO_MAP, LESSON_MAP }
export function useKey(fn: (e: KeyboardEvent) => void) { useEffect(() => { window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn) }) }

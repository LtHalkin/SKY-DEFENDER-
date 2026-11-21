import { useSyncExternalStore } from 'react'
import { SimEngine, defaultConfig, type Command } from '../sim/engine'
import type { GameState } from '../sim/types'
import { computeScores } from '../sim/scoring'
import { audio } from './audio'
import { levelOf, loadSave, writeSave, MEDALS, type Save } from '../game/save'

export type Screen = 'HOME' | 'SHOP' | 'HANGAR' | 'STATS' | 'SETTINGS' | 'GAME' | 'DEBRIEF'
export interface View { lat: number; lon: number; rangeNm: number }
export type PickMode = null | { kind: 'point'; label: string; cb: (p: { lat: number; lon: number }) => void }
export interface Fx { kind: string; lat: number; lon: number; t0: number; text?: string; n?: number }
export interface Popup { id: string; kind: 'hostile' | 'refused' | 'complied'; trackId: string; t0: number }
export interface Reward { base: number; airspaceBonus: number; gradeBonus: number; total: number; xp: number; levelBefore: number; levelAfter: number; newMedals: string[] }
export const SHIFT_SEC = 2400 // sim seconds; at normal speed (4x) this is a 10-minute shift
export const BASE_SPEED = 4

class Store {
  engine: SimEngine | null = null
  screen: Screen = 'HOME'
  save: Save = loadSave()
  view: View = { lat: 55.0, lon: -2.8, rangeNm: 420 }
  speed = BASE_SPEED; paused = false
  sel: { track?: string; asset?: string; battery?: string } = {}
  pick: PickMode = null
  version = 0
  listeners = new Set<() => void>()
  fx: Fx[] = []
  popups: Popup[] = []
  debrief: { scores: ReturnType<typeof computeScores>; st: GameState; result: string; reward: Reward } | null = null
  stepMsg = ''
  private raf = 0; private last = 0; private acc = 0; private lastNotify = 0

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getVersion = () => this.version
  notify() { this.version++; this.listeners.forEach((l) => l()) }
  get st(): GameState | null { return this.engine?.st ?? null }
  setScreen(s: Screen) { this.screen = s; this.notify() }
  persist() { writeSave(this.save) }
  applyAudio() { const s = this.save.settings; audio.volume = s.volume; audio.voiceOn = s.voice; audio.sfxOn = s.sfx; audio.eleven.key = s.elevenKey ?? '' }
  get level() { return levelOf(this.save.xp).level }

  startShift() {
    audio.unlock(); this.applyAudio(); audio.stopAll()
    const lvl = this.level, r = Math.random
    const cfg = defaultConfig({
      mode: 'SANDBOX', scenarioId: 'QUICK', seed: Math.floor(r() * 900000) + 1000, startHour: 8 + Math.floor(r() * 10), traffic: 0.75,
      weather: lvl < 3 ? 'CLEAR' : r() < 0.6 ? 'CLEAR' : 'RAIN', complexity: 1, tension0: Math.min(0.9, 0.2 + lvl * 0.05), growth: false,
      fleet: this.save.fleet, batteries: this.save.batteries, upgrades: this.save.upgrades, hostiles: true, level: lvl,
    })
    const e = new SimEngine(cfg); e.warm(150)
    e.st.flags.quick = true; e.st.nextEvent = e.st.t + 120
    if (!this.save.tutorial) e.st.flags.nextRaid = e.st.t + 900 // gentler first shift
    this.engine = e; this.paused = false; this.speed = BASE_SPEED; this.sel = {}; this.pick = null; this.fx = []; this.popups = []; this.debrief = null
    this.view = { lat: 55.0, lon: -2.8, rangeNm: 420 }
    this.screen = 'GAME'; this.acc = 0; this.last = performance.now()
    cancelAnimationFrame(this.raf); this.loop(this.last)
    this.notify()
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; audio.stopAll() }
  quit() { this.stop(); this.engine = null; this.setScreen('HOME') }
  dispatch(cmd: Command): string | null { if (!this.engine) return null; const r = this.engine.dispatch(cmd); this.drain(); this.notify(); return r }
  setSpeed(mult: number) { this.speed = BASE_SPEED * mult; this.paused = false; this.notify() }
  togglePause() { this.paused = !this.paused; this.notify() }
  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const st = this.st; if (!st || this.screen !== 'GAME') { this.last = now; return }
    const dtr = Math.min(0.25, (now - this.last) / 1000); this.last = now
    if (!this.paused && !st.ended) {
      this.acc += dtr * this.speed
      let n = Math.floor(this.acc); this.acc -= n; n = Math.min(n, 60)
      if (n > 0) this.engine!.step(n)
      if (st.t - st.startT >= SHIFT_SEC && !st.ended) { st.ended = true; st.flags.result = 'COMPLETE' }
    }
    this.drain()
    if (st.ended) this.finish()
    if (now - this.lastNotify > 200) { this.lastNotify = now; this.notify() }
  }
  drain() {
    const st = this.st; if (!st || !st.events.length) return
    const now = performance.now()
    for (const ev of st.events.splice(0)) {
      if (ev.type === 'msg') { audio.speak(ev.msg); if (ev.msg.sev === 'URGENT' && ev.msg.channel !== 'PILOT') audio.warble() }
      else if (ev.type === 'alert') { if (ev.sev >= 3) audio.alarm(); else audio.chime() }
      else if (ev.type === 'emergency') audio.alarm()
      else if (ev.type === 'newTrack') { /* quiet */ }
      else if (ev.type === 'fx') {
        this.fx.push({ kind: ev.kind, lat: ev.lat, lon: ev.lon, t0: now, text: ev.text, n: ev.n })
        if (ev.kind === 'launch') audio.launch(); else if (ev.kind === 'splash') audio.boom(); else if (ev.kind === 'breach') audio.alarm(); else if (ev.kind === 'coins' && (ev.n ?? 0) > 0) audio.coin()
      } else if (ev.type === 'ui') {
        const [k, id] = ev.name.split(':')
        if (k === 'hostile' || k === 'refused' || k === 'complied') { this.popups = this.popups.filter((p) => p.trackId !== id); this.popups.push({ id: ev.name + st.t, kind: k, trackId: id, t0: now }); if (k !== 'complied') audio.alarm() }
      }
    }
    this.fx = this.fx.filter((f) => now - f.t0 < 3000)
  }
  endWatch() { const st = this.st; if (st && !st.ended) { st.ended = true; st.flags.result = 'ENDED EARLY' } this.finish() }
  finish() {
    const st = this.st; if (!st || this.screen === 'DEBRIEF') return
    const scores = computeScores(st)
    const result = (st.flags.result as string) ?? 'COMPLETE'
    const sv = this.save
    const levelBefore = this.level
    const full = result === 'COMPLETE'
    const base = st.coins
    const airspaceBonus = full ? Math.round(st.airspace * 1.5) : 0
    const gradeBonus = full ? ({ A: 120, B: 70, C: 35, D: 10, E: 0 } as Record<string, number>)[scores.grade] ?? 0 : 0
    const total = base + airspaceBonus + gradeBonus
    const xp = Math.max(0, total) + (full ? 50 : 10)
    sv.coins = Math.max(0, sv.coins + total); sv.xp += xp
    sv.stats.shifts++; sv.stats.splashes += st.splashes; sv.stats.ids += Math.floor(st.score.idCorrect); sv.stats.emergencies += Math.floor(st.score.incidentsHandled)
    sv.stats.breaches += Math.round((100 - st.airspace) / 20); sv.stats.coinsEarned += Math.max(0, total)
    sv.stats.complied += st.coinLog.filter((c) => c.why === 'Intruder complied').length
    if (scores.overall > sv.stats.best) { sv.stats.best = scores.overall; sv.stats.bestGrade = scores.grade }
    const earned: string[] = []
    const give = (id: string, ok: boolean) => { if (ok && !sv.medals.includes(id)) { sv.medals.push(id); earned.push(MEDALS.find((m) => m.id === id)!.name) } }
    give('first_shift', true); give('first_splash', sv.stats.splashes >= 1); give('ace', sv.stats.splashes >= 5); give('peacemaker', sv.stats.complied >= 5)
    give('eagle_eye', sv.stats.ids >= 50); give('lifesaver', sv.stats.emergencies >= 10); give('fortress', full && st.airspace === 100 && st.splashes > 0)
    give('grade_a', full && scores.grade === 'A'); give('veteran', sv.stats.shifts >= 10); give('collector', sv.fleet.length >= 8)
    sv.tutorial = true; sv.lastShift = { grade: scores.grade, score: scores.overall, coins: total }
    this.persist()
    this.debrief = { scores, st, result, reward: { base, airspaceBonus, gradeBonus, total, xp, levelBefore, levelAfter: this.level, newMedals: earned } }
    this.paused = true; this.screen = 'DEBRIEF'; this.stop(); this.notify()
  }
  select(trackId?: string) { this.sel = { track: trackId }; this.stepMsg = ''; this.notify() }
  centreOn(p: { lat: number; lon: number }, range?: number) { this.view = { lat: p.lat, lon: p.lon, rangeNm: range ?? this.view.rangeNm }; this.notify() }
}
export const store = new Store()
store.applyAudio()
if (typeof window !== 'undefined') (window as any).__sd = store
export function useStore<T>(sel: (s: Store) => T): T { useSyncExternalStore(store.subscribe, store.getVersion); return sel(store) }

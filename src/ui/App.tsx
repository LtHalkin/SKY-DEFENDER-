import { useEffect, useState } from 'react'
import { LESSONS, SCENARIOS, SCENARIO_MAP, LESSON_MAP } from '../sim/scenarios'
import { defaultConfig } from '../sim/engine'
import { RADAR_DEFS } from '../sim/data/radars'
import { targetCount } from '../sim/traffic'
import type { GameConfig } from '../sim/types'
import { store, useStore } from './store'
import { saveProfile } from './profile'
import { audio } from './audio'
import { RadarCanvas } from './RadarCanvas'
import { Windows, useLayout, tile, type PanelDef } from './WindowManager'
import { TrackList, TrackDetail } from './panels/Tracks'
import { FlightPlans } from './panels/Plans'
import { Assets, Airfields } from './panels/Assets'
import { Operations } from './panels/Ops'
import { Comms } from './panels/Comms'
import { Intel } from './panels/Intel'
import { Incidents, SystemStatus, Watch } from './panels/Status'
import { computeScores } from '../sim/scoring'
import { Btn, hms } from './common'
import { SimpleGame } from './SimpleGame'

const PANELS: PanelDef[] = [
  { id: 'tracks', title: 'TRACK LIST', render: () => <TrackList />, def: { x: 0.795, y: 0.065, w: 0.2, h: 0.3, open: true } },
  { id: 'detail', title: 'TRACK DETAIL / IDENTIFICATION', render: () => <TrackDetail />, def: { x: 0.795, y: 0.37, w: 0.2, h: 0.625, open: true } },
  { id: 'comms', title: 'COMMS', render: () => <Comms />, def: { x: 0.005, y: 0.7, w: 0.3, h: 0.295, open: true } },
  { id: 'incidents', title: 'INCIDENT LOG', render: () => <Incidents />, def: { x: 0.31, y: 0.76, w: 0.2, h: 0.235, open: true } },
  { id: 'ops', title: 'ACTIVE OPERATIONS', render: () => <Operations />, def: { x: 0.005, y: 0.065, w: 0.21, h: 0.62, open: true } },
  { id: 'plans', title: 'FLIGHT PLANS / REGISTER', render: () => <FlightPlans />, def: { x: 0.2, y: 0.08, w: 0.35, h: 0.5, open: false } },
  { id: 'assets', title: 'ASSETS', render: () => <Assets />, def: { x: 0.2, y: 0.1, w: 0.34, h: 0.55, open: false } },
  { id: 'airfields', title: 'AIRFIELDS', render: () => <Airfields />, def: { x: 0.22, y: 0.12, w: 0.34, h: 0.5, open: false } },
  { id: 'intel', title: 'INTELLIGENCE', render: () => <Intel />, def: { x: 0.24, y: 0.14, w: 0.3, h: 0.5, open: false } },
  { id: 'system', title: 'SYSTEM STATUS', render: () => <SystemStatus />, def: { x: 0.26, y: 0.1, w: 0.3, h: 0.62, open: false } },
  { id: 'watch', title: 'WATCH / MENTOR', render: () => <Watch />, def: { x: 0.005, y: 0.07, w: 0.22, h: 0.35, open: false } },
]
const RANGES = [50, 100, 200, 400, 800]
const SPEEDS = [1, 2, 5, 10, 30]

export function App() {
  const screen = useStore((s) => s.screen)
  useEffect(() => {
    const fit = () => { const k = Math.max(11, Math.min(34, Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * 16 * store.profile.settings.uiScale)); document.documentElement.style.fontSize = k + 'px' }
    fit(); window.addEventListener('resize', fit); (window as any).__fit = fit
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div className="app">
      {screen === 'MENU' && <MainMenu />}
      {screen === 'SANDBOX' && <SandboxSetup />}
      {screen === 'TRAINING' && <TrainingMenu />}
      {screen === 'TRADE' && <TradeMenu />}
      {screen === 'RECORDS' && <Records />}
      {screen === 'BRIEFING' && <Briefing />}
      {(screen === 'GAME' || screen === 'DEBRIEF') && (store.simple ? <SimpleGame /> : <Workstation />)}
      {screen === 'DEBRIEF' && <Debrief />}
    </div>
  )
}

function Frame({ title, children, back = true }: { title: string; children: React.ReactNode; back?: boolean }) {
  return <div className="menu"><div className="menu-box"><div className="menu-title">{title}</div>{children}{back && <div className="menu-foot"><Btn onClick={() => store.setScreen('MENU')}>◀ MAIN MENU</Btn></div>}</div></div>
}
const randSeed = () => Math.floor(Math.random() * 900000) + 1000
let pendingCfg: GameConfig | null = null
function go(cfg: GameConfig) { pendingCfg = cfg; store.setScreen('BRIEFING') }

function MainMenu() {
  return (
    <div className="menu"><div className="menu-box wide">
      <div className="logo">SKY DEFENDER</div>
      <div className="sub">UK AIRSPACE OPERATIONS SIMULATOR · RECOGNISED AIR PICTURE · 1998</div>
      <div className="mode-grid">
        <button onClick={() => go(defaultConfig({ mode: 'COMBAT', seed: randSeed(), startHour: 6, traffic: 1, weather: 'RANDOM', complexity: 0.6, tension0: 0.03 }))}><b>COMBAT READY</b><span>Endless watch. Quiet start; the situation evolves and your decisions shape it.</span></button>
        <button onClick={() => go(defaultConfig({ mode: 'INSTANT', seed: randSeed(), startHour: 17, traffic: 1.6, weather: 'RAIN', complexity: 1, tension0: 0.55 }))}><b>INSTANT ACTION</b><span>Start in the middle of a busy, high-pressure picture with multiple live incidents.</span></button>
        <button onClick={() => go(defaultConfig({ mode: 'SANDBOX', scenarioId: 'QUICK', seed: randSeed(), startHour: 14, traffic: 0.7, weather: 'CLEAR', complexity: 1, tension0: 0.3, growth: false }))}><b>QUICK WATCH (SIMPLE)</b><span>Simpler arcade-style view: colour-coded planes, big buttons, 10-minute shift.</span></button>
        <button onClick={() => store.setScreen('TRAINING')}><b>BASIC TRAINING</b><span>Interactive lessons: radar, identification, flight plans, comms, asset management.</span></button>
        <button onClick={() => store.setScreen('TRADE')}><b>TRADE TRAINING</b><span>Eight objective-based scenarios with a mentor. Complete each to unlock the next.</span></button>
        <button onClick={() => store.setScreen('SANDBOX')}><b>SANDBOX</b><span>Configure traffic, weather, radar availability, time of day and complexity.</span></button>
        <button onClick={() => store.setScreen('RECORDS')}><b>PERSONAL RECORDS</b><span>Grades, bests and unlocked training.</span></button>
      </div>
      <div className="menu-foot dim">Radar: wheel = zoom · drag = pan · click = select · right-click = context menu · SPACE = pause · 1–5 = speed · panels move/resize/hide from the PANELS menu</div>
    </div></div>
  )
}

function Briefing() {
  const cfg = pendingCfg!
  const sc = cfg.scenarioId ? SCENARIO_MAP[cfg.scenarioId] : null; const ls = cfg.scenarioId ? LESSON_MAP[cfg.scenarioId] : null
  const lines: string[] = sc ? sc.brief : ls ? [ls.intro] : cfg.mode === 'COMBAT'
    ? ['You are the surveillance and operations coordinator at the Control and Reporting Centre. The watch begins at 0600Z in a quiet period.', 'Maintain the Recognised Air Picture, identify what is unknown, handle emergencies and keep your aircraft and fuel in order.', 'The situation will grow more complex as the watch continues. The watch ends when you decide.']
    : cfg.mode === 'INSTANT' ? ['It is 1700Z. You are taking over a busy picture mid-incident: unidentified contacts, a civil emergency and a degraded radar station.', 'There is no handover time. You have 45 minutes of watch to stabilise the picture.', 'Prioritise emergencies, then non-cooperative contacts, then correlation.']
    : ['Sandbox watch with your own settings. End the watch at any time.']
  const objs = sc ? sc.objectives : []
  const title = sc ? sc.title : ls ? ls.title : cfg.mode === 'COMBAT' ? 'COMBAT READY — OPERATIONAL BRIEFING' : cfg.mode === 'INSTANT' ? 'INSTANT ACTION — OPERATIONAL BRIEFING' : 'SANDBOX — BRIEFING'
  return <Frame title={title} back={false}>
    <div className="brief">{lines.map((l, i) => <p key={i}>{l}</p>)}
      {objs.length > 0 && <><div className="sect">MISSION OBJECTIVES</div>{objs.map((o) => <div key={o.id}>○ {o.text}{o.optional ? ' (optional)' : ''}</div>)}</>}
      <div className="sect">CONDITIONS</div><div>Start {String(cfg.startHour).padStart(2, '0')}00Z · weather {cfg.weather} · traffic ×{cfg.traffic.toFixed(1)} · seed {cfg.seed}{cfg.radarOff.length ? ` · radars offline: ${cfg.radarOff.join(', ')}` : ''}{sc ? ` · time limit ${sc.limitMin} min` : ''}</div>
    </div>
    <div className="menu-foot"><Btn onClick={() => store.setScreen('MENU')}>◀ CANCEL</Btn> <Btn kind="ok" onClick={() => { store.start(cfg); if (cfg.mode === 'BASIC' || cfg.mode === 'TRADE') store.requestPanel('watch') }}>BEGIN WATCH ▶</Btn></div>
  </Frame>
}

function TrainingMenu() {
  const p = store.profile
  return <Frame title="BASIC TRAINING">
    <div className="list">{LESSONS.map((l) => <button key={l.id} className="item" onClick={() => go(defaultConfig({ mode: 'BASIC', scenarioId: l.id, seed: l.cfg.seed, traffic: l.cfg.traffic, weather: l.cfg.weather, startHour: l.cfg.hour, complexity: 0, incidents: false, intel: l.cfg.intel ?? false, radarFaults: false, tension0: 0, growth: false }))}>
      <b>{l.title}</b> <span className="dim">{l.steps.length} steps</span> {p.lessonsDone.includes(l.id) && <span className="ok">✓ COMPLETE</span>}<div className="dim">{l.intro}</div></button>)}</div></Frame>
}
function TradeMenu() {
  const p = store.profile
  return <Frame title="TRADE TRAINING — STRUCTURED SCENARIOS">
    <div className="list">{SCENARIOS.map((s) => {
      const locked = !!s.unlock && p.tradeBest[s.unlock]?.result !== 'SUCCESS'; const best = p.tradeBest[s.id]
      return <button key={s.id} className={`item ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => go(defaultConfig({ mode: 'TRADE', scenarioId: s.id, seed: s.cfg.seed, traffic: s.cfg.traffic, weather: s.cfg.weather, startHour: s.cfg.hour, complexity: s.cfg.complexity, radarOff: s.cfg.radarOff ?? [], incidents: s.cfg.incidents ?? false, intel: s.cfg.intel ?? false, radarFaults: s.cfg.radarFaults ?? false, tension0: s.cfg.tension0 ?? 0.03, growth: false }))}>
        <b>{s.title}</b> <span className="dim">{s.limitMin} min</span> {locked ? <span className="alert">🔒 complete {s.unlock}</span> : best ? <span className={best.result === 'SUCCESS' ? 'ok' : 'amber'}>BEST {best.grade} ({best.score}) {best.result}</span> : <span className="dim">NOT ATTEMPTED</span>}<div className="dim">{s.brief[0]}</div></button>
    })}</div></Frame>
}
function Records() {
  const p = store.profile
  return <Frame title="PERSONAL RECORDS">
    <div className="brief"><div className="kv"><span>WATCHES COMPLETED</span><b>{p.totals.watches}</b></div><div className="kv"><span>CORRECT IDENTIFICATIONS</span><b>{p.totals.idCorrect}</b></div><div className="kv"><span>INCIDENTS HANDLED</span><b>{p.totals.incidentsHandled}</b></div>
      <div className="sect">BY MODE</div><table className="grid"><thead><tr><th>MODE</th><th>WATCHES</th><th>BEST</th><th>GRADE</th><th>SIM HOURS</th></tr></thead><tbody>{Object.entries(p.records).map(([k, r]) => <tr key={k}><td>{k}</td><td>{r.watches}</td><td>{r.best}</td><td>{r.bestGrade}</td><td>{r.simHours.toFixed(1)}</td></tr>)}</tbody></table>
      <div className="sect">TRADE TRAINING</div><table className="grid"><tbody>{SCENARIOS.map((s) => <tr key={s.id}><td>{s.title}</td><td>{p.tradeBest[s.id]?.grade ?? '—'}</td><td>{p.tradeBest[s.id]?.result ?? ''}</td></tr>)}</tbody></table>
      <div className="sect">BASIC TRAINING</div><div>{LESSONS.map((l) => <div key={l.id} className={p.lessonsDone.includes(l.id) ? 'ok' : 'dim'}>{p.lessonsDone.includes(l.id) ? '✓' : '○'} {l.title}</div>)}</div>
    </div>
    <div className="menu-foot"><Btn kind="danger" onClick={() => { if (confirm('Erase all records?')) { localStorage.removeItem('sd.profile.v1'); location.reload() } }}>RESET RECORDS</Btn></div></Frame>
}

function SandboxSetup() {
  const [c, setC] = useState({ traffic: 1, weather: 'CLEAR' as GameConfig['weather'], hour: 12, complexity: 0.5, tension: 0.2, seed: 1998, incidents: true, intel: true, faults: true, growth: false, off: [] as string[] })
  const set = (k: string, v: any) => setC((x) => ({ ...x, [k]: v }))
  const tmp = { t: c.hour * 3600, cfg: { traffic: c.traffic } } as any
  return <Frame title="SANDBOX CONFIGURATION">
    <div className="form wide">
      <div className="frow"><label>TRAFFIC DENSITY ×{c.traffic.toFixed(1)}</label><input type="range" min={0.2} max={3} step={0.1} value={c.traffic} onChange={(e) => set('traffic', +e.target.value)} /><span className="dim">≈ {targetCount(tmp)} aircraft airborne</span></div>
      <div className="frow"><label>WEATHER</label><select value={c.weather} onChange={(e) => set('weather', e.target.value)}>{['CLEAR', 'RAIN', 'STORM', 'RANDOM'].map((w) => <option key={w}>{w}</option>)}</select></div>
      <div className="frow"><label>TIME OF DAY (Z)</label><input type="range" min={0} max={23} value={c.hour} onChange={(e) => set('hour', +e.target.value)} /><span>{String(c.hour).padStart(2, '0')}00Z</span></div>
      <div className="frow"><label>SCENARIO COMPLEXITY ×{c.complexity.toFixed(1)}</label><input type="range" min={0} max={1} step={0.1} value={c.complexity} onChange={(e) => set('complexity', +e.target.value)} /></div>
      <div className="frow"><label>STARTING TENSION {Math.round(c.tension * 100)}%</label><input type="range" min={0} max={1} step={0.05} value={c.tension} onChange={(e) => set('tension', +e.target.value)} /></div>
      <div className="frow"><label>SEED</label><input type="number" value={c.seed} onChange={(e) => set('seed', +e.target.value)} /><Btn onClick={() => set('seed', randSeed())}>RANDOM</Btn></div>
      <div className="frow"><label>OPTIONS</label><span><label><input type="checkbox" checked={c.incidents} onChange={(e) => set('incidents', e.target.checked)} /> incidents</label> <label><input type="checkbox" checked={c.intel} onChange={(e) => set('intel', e.target.checked)} /> intelligence</label> <label><input type="checkbox" checked={c.faults} onChange={(e) => set('faults', e.target.checked)} /> radar faults</label> <label><input type="checkbox" checked={c.growth} onChange={(e) => set('growth', e.target.checked)} /> difficulty ramps</label></span></div>
      <div className="frow"><label>RADAR AVAILABILITY</label><span className="chips">{RADAR_DEFS.map((r) => <label key={r.id} className="chip"><input type="checkbox" checked={!c.off.includes(r.id)} onChange={(e) => set('off', e.target.checked ? c.off.filter((x) => x !== r.id) : [...c.off, r.id])} /> {r.name.replace('RRH ', '')}</label>)}</span></div>
    </div>
    <div className="menu-foot"><Btn onClick={() => store.setScreen('MENU')}>◀ MAIN MENU</Btn> <Btn kind="ok" onClick={() => go(defaultConfig({ mode: 'SANDBOX', seed: c.seed, startHour: c.hour, traffic: c.traffic, weather: c.weather, complexity: c.complexity, tension0: c.tension, radarOff: c.off, incidents: c.incidents, intel: c.intel, radarFaults: c.faults, growth: c.growth }))}>CONFIGURE & START ▶</Btn></div></Frame>
}

function Debrief() {
  const d = store.debrief; if (!d) return null
  const { scores, st, result } = d
  const s = st.score
  const back = () => { store.stop(); store.engine = null; store.setScreen('MENU') }
  return <div className="modal"><div className="menu-box wide debrief">
    <div className="menu-title">END-OF-WATCH DEBRIEF · {st.cfg.mode}{st.cfg.scenarioId ? ' · ' + st.cfg.scenarioId : ''} · {result}</div>
    <div className="gradeline"><span className={`grade g${scores.grade}`}>{scores.grade}</span><span>OVERALL {scores.overall}/100</span><span className="dim">watch length {Math.round((st.t - st.startT) / 60)} min · seed {st.cfg.seed}</span></div>
    <div className="grid2">
      {(['identification', 'awareness', 'resources', 'incidents'] as const).map((k) => <div className="kv" key={k}><span>{k.toUpperCase()}</span><b>{scores[k]}</b></div>)}
    </div>
    <div className="sect">RECORD</div>
    <table className="grid"><tbody>
      <tr><td>Identifications correct / wrong / false alarms</td><td>{s.idCorrect} / {s.idWrong} / {s.falseAlarms}</td></tr>
      <tr><td>Incidents handled / failed / total</td><td>{s.incidentsHandled} / {s.incidentsFailed} / {s.incidentsTotal}</td></tr>
      <tr><td>Intelligence assessed correctly / incorrectly</td><td>{s.intelCorrect} / {s.intelWrong}</td></tr>
      <tr><td>Operations completed / aborted / failed</td><td>{s.opsCompleted} / {s.opsAborted} / {s.opsFailed}</td></tr>
      <tr><td>Bingo events · maintenance holds · undetected transits</td><td>{s.bingoEvents} · {s.maintLost} · {s.undetected}</td></tr>
    </tbody></table>
    {st.objectives.length > 0 && <><div className="sect">OBJECTIVES</div>{st.objectives.map((o) => <div key={o.id} className={o.done ? 'ok' : o.failed ? 'alert' : 'dim'}>{o.done ? '✓' : o.failed ? '✗' : '○'} {o.text}</div>)}</>}
    {scores.notes.length > 0 && <><div className="sect">ASSESSOR NOTES</div>{scores.notes.map((n, i) => <div key={i}>• {n}</div>)}</>}
    {s.log.length > 0 && <><div className="sect">DECISION LOG</div><div className="hist">{s.log.slice(-12).map((l, i) => <div key={i} className="dim">{l}</div>)}</div></>}
    <div className="menu-foot">
      <Btn onClick={back}>MAIN MENU</Btn>
      {((st.cfg.mode === 'COMBAT' || st.cfg.mode === 'SANDBOX' || st.cfg.mode === 'INSTANT') && st.cfg.scenarioId !== 'QUICK') && <Btn kind="ok" onClick={() => { st.ended = false; delete st.flags.result; if (st.cfg.mode === 'INSTANT') st.flags.limit = 1e9; store.debrief = null; store.paused = false; store.screen = 'GAME'; store.notify() }}>CONTINUE WATCH</Btn>}
      <Btn onClick={() => { store.stop(); go(st.cfg) }}>REPLAY ▶</Btn>
    </div></div></div>
}

function Workstation() {
  const st = useStore((s) => s.st)!
  const { layout, update, reset } = useLayout(PANELS)
  const [menu, setMenu] = useState(false)
  const speed = useStore((s) => s.speed), paused = useStore((s) => s.paused), range = useStore((s) => s.view.rangeNm)
  const layers = useStore((s) => s.layers)
  const sc = computeScores(st)
  const banner = store.banner && store.banner.until > performance.now() ? store.banner : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); store.togglePause() }
      else if (e.key >= '1' && e.key <= '5') store.setSpeed(SPEEDS[+e.key - 1])
      else if (e.key === '+' || e.key === '=') { store.view = { ...store.view, rangeNm: Math.max(10, store.view.rangeNm / 1.4) }; store.ui('zoom'); store.notify() }
      else if (e.key === '-') { store.view = { ...store.view, rangeNm: Math.min(1800, store.view.rangeNm * 1.4) }; store.ui('zoom'); store.notify() }
      else if (e.key === 'Escape') { store.pick = null; store.select(undefined) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { const d = store.view.rangeNm / 60; store.view = { ...store.view, lon: store.view.lon + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0), lat: store.view.lat + (e.key === 'ArrowUp' ? d / 1.6 : e.key === 'ArrowDown' ? -d / 1.6 : 0) }; store.ui('pan'); store.notify() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  const preset = (open: string[]) => update((l) => { const o = { ...l }; PANELS.forEach((p) => { o[p.id] = { ...o[p.id], open: open.includes(p.id) } }); return tile(PANELS.filter((p) => open.includes(p.id)), o) })
  const date = new Date(Date.UTC(1998, 9, 12) + st.t * 1000)
  const openInc = st.incidents.filter((i) => i.closed === null && !i.acked).length
  return (
    <div className="ws">
      <div className="radar-layer"><RadarCanvas /></div>
      <div className="topbar">
        <div className="tb-group"><b className="brand">SKY DEFENDER</b><span className="dim">{st.cfg.mode}</span></div>
        <div className="tb-group clock"><span>{hms(st.t)}Z</span><span className="dim">{date.getUTCDate()} OCT 1998</span></div>
        <div className="tb-group">
          <button onClick={() => store.togglePause()} className={paused ? 'on' : ''} title="Pause / resume (SPACE)">{paused ? '▶' : '⏸'}</button>
          <button onClick={() => store.stepOnce(1)} title="Step 1 s">+1s</button><button onClick={() => store.stepOnce(10)} title="Step 10 s">+10s</button>
          {SPEEDS.map((s) => <button key={s} className={!paused && speed === s ? 'on' : ''} onClick={() => store.setSpeed(s)}>{s}×</button>)}
        </div>
        <div className="tb-group"><span className="dim">RANGE</span>{RANGES.map((r) => <button key={r} className={Math.abs(range - r) / r < 0.02 ? 'on' : ''} onClick={() => { store.view = { ...store.view, rangeNm: r }; store.ui('range'); store.notify() }}>{r}</button>)}</div>
        <div className="tb-group"><span className="dim">LAYERS</span>
          {([['coverage', 'COV'], ['sweeps', 'SWP'], ['airways', 'AWY'], ['regions', 'FIR'], ['zones', 'DNG'], ['weather', 'WX'], ['trails', 'TRL'], ['labels', 'LBL'], ['rings', 'RNG'], ['airports', 'APT']] as const).map(([k, t]) => <button key={k} className={layers[k] ? 'on' : ''} onClick={() => store.toggleLayer(k)}>{t}</button>)}
          <button onClick={() => { store.pick = { kind: 'measure' }; store.notify() }}>MEAS</button>
        </div>
        <div className="tb-group right">
          <button className={openInc ? 'flash' : ''} onClick={() => update((l) => ({ ...l, incidents: { ...l.incidents, open: true, z: 99 } }))}>⚠ {openInc}</button>
          <span className="score" title="Live evaluation">{sc.overall} · {sc.grade}</span>
          <button onClick={() => { audio.unlock(); audio.voiceOn = !audio.voiceOn; store.profile.settings.voice = audio.voiceOn; saveProfile(store.profile); if (!audio.voiceOn) audio.stopAll(); store.ui('audio'); store.notify() }}>{audio.voiceOn ? '🔊' : '🔇'}</button>
          <div className="menuwrap"><button onClick={() => setMenu(!menu)}>PANELS ▾</button>
            {menu && <div className="dropdown" onMouseLeave={() => setMenu(false)}>
              {PANELS.map((p) => <label key={p.id}><input type="checkbox" checked={layout[p.id].open} onChange={(e) => { update((l) => ({ ...l, [p.id]: { ...l[p.id], open: e.target.checked, z: Math.max(...Object.values(l).map((x) => x.z)) + 1 } })); if (e.target.checked) store.ui('panel:' + p.id) }} /> {p.title}</label>)}
              <hr /><button onClick={() => update((l) => tile(PANELS, l))}>TILE OPEN PANELS</button>
              <button onClick={() => preset(['tracks', 'detail', 'incidents', 'comms'])}>PRESET: SURVEILLANCE</button>
              <button onClick={() => preset(['assets', 'airfields', 'ops', 'comms'])}>PRESET: LOGISTICS</button>
              <button onClick={() => preset(['system', 'intel', 'plans', 'watch'])}>PRESET: ANALYSIS</button>
              <button onClick={reset}>RESET LAYOUT</button>
              <hr /><label>UI SCALE <input type="range" min={0.7} max={1.8} step={0.1} value={store.profile.settings.uiScale} onChange={(e) => { store.profile.settings.uiScale = +e.target.value; saveProfile(store.profile); (window as any).__fit(); store.notify() }} /></label>
              <label>VOLUME <input type="range" min={0} max={1} step={0.1} value={audio.volume} onChange={(e) => { audio.volume = +e.target.value; store.profile.settings.volume = audio.volume; saveProfile(store.profile) }} /></label>
              <hr /><button onClick={() => { if (confirm('End watch and show debrief?')) store.endWatch() }}>END WATCH</button>
              <button onClick={() => { if (confirm('Abandon watch and return to menu?')) { store.stop(); store.engine = null; store.setScreen('MENU') } }}>ABANDON TO MENU</button>
            </div>}
          </div>
        </div>
      </div>
      {banner && <div className={`banner s${banner.sev}`}>⚠ {banner.text}</div>}
      <Windows panels={PANELS} layout={layout} update={update} />
    </div>
  )
}

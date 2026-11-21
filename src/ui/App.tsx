import { useEffect, useState } from 'react'
import { defaultConfig } from '../sim/engine'
import { store, useStore } from './store'
import { SimpleGame, VoiceSetup } from './SimpleGame'
import { Btn } from './common'

const seed = () => Math.floor(Math.random() * 900000) + 1000
const newShift = () => store.start(defaultConfig({ mode: 'SANDBOX', scenarioId: 'QUICK', seed: seed(), startHour: 14, traffic: 0.7, weather: 'CLEAR', complexity: 1, tension0: 0.3, growth: false }))

export function App() {
  const screen = useStore((s) => s.screen)
  useEffect(() => {
    const fit = () => { document.documentElement.style.fontSize = Math.max(11, Math.min(34, Math.min(innerWidth / 1920, innerHeight / 1080) * 16)) + 'px' }
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit)
  }, [])
  return <div className="app">{screen === 'MENU' || screen === 'BRIEFING' ? <Menu /> : <><SimpleGame />{screen === 'DEBRIEF' && <Debrief />}</>}</div>
}

function Menu() {
  const [voice, setVoice] = useState(false)
  const p = store.profile.records.SANDBOX
  return <div className="menu"><div className="menu-box">
    <div className="logo">SKY DEFENDER</div>
    <div className="sub">UK AIRSPACE WATCH · 1998</div>
    <div className="brief">
      <p>You run the radar. Aircraft fly themselves — you decide what is safe, what is unknown and what needs help. Shifts last 10 minutes.</p>
      <p>● <span style={{ color: '#f2f2f2' }}>White</span> = safe · <span style={{ color: '#ffe34d' }}>Yellow</span> = unknown, check it · <span style={{ color: '#c77dff' }}>Purple</span> = suspicious · <span style={{ color: '#ff9a2e' }}>Orange</span> = emergency · <span style={{ color: '#39ff7a' }}>Green</span> = your jets</p>
      <p className="dim">Click a plane for options. Scroll to zoom, drag to move, SPACE to pause.{p ? ` Best grade so far: ${p.bestGrade} (${p.best}).` : ''}</p>
    </div>
    <div className="menu-foot"><Btn onClick={() => setVoice(true)}>VOICE SETUP (ELEVENLABS)</Btn><Btn kind="ok" onClick={newShift}>START SHIFT ▶</Btn></div>
    {voice && <VoiceSetup onClose={() => setVoice(false)} />}
  </div></div>
}

function Debrief() {
  const d = store.debrief; if (!d) return null
  const { scores, st } = d, s = st.score
  return <div className="modal"><div className="menu-box debrief">
    <div className="menu-title">END OF SHIFT</div>
    <div className="gradeline"><span className={`grade g${scores.grade}`}>{scores.grade}</span><span>SCORE {scores.overall}/100</span></div>
    <div className="grid2">{(['identification', 'awareness', 'resources', 'incidents'] as const).map((k) => <div className="kv" key={k}><span>{k.toUpperCase()}</span><b>{scores[k]}</b></div>)}</div>
    <table className="grid"><tbody>
      <tr><td>Planes correctly identified / wrong / false alarms</td><td>{s.idCorrect} / {s.idWrong} / {s.falseAlarms}</td></tr>
      <tr><td>Emergencies handled / failed</td><td>{s.incidentsHandled} / {s.incidentsFailed}</td></tr>
      <tr><td>Jet sorties completed / aborted / failed</td><td>{s.opsCompleted} / {s.opsAborted} / {s.opsFailed}</td></tr>
    </tbody></table>
    {scores.notes.map((n, i) => <div key={i}>• {n}</div>)}
    <div className="menu-foot"><Btn onClick={() => { store.stop(); store.engine = null; store.setScreen('MENU') }}>MENU</Btn><Btn kind="ok" onClick={() => { store.stop(); newShift() }}>PLAY AGAIN ▶</Btn></div>
  </div></div>
}

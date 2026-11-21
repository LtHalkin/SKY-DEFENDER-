import { useState } from 'react'
import { computeScores } from '../../sim/scoring'
import { currentStep, mentorHint, SCENARIO_MAP } from '../../sim/scenarios'
import { AIRPORT_MAP } from '../../sim/data/airports'
import { store, useStore } from '../store'
import { Bar, Btn, hm, hms } from '../common'
import { label } from '../../sim/identification'

export function Incidents() {
  const st = useStore((s) => s.st)!
  const selId = useStore((s) => s.sel.incident)
  const [all, setAll] = useState(false)
  const list = [...st.incidents].filter((i) => all || i.closed === null).reverse()
  const inc = st.incidents.find((i) => i.id === selId) ?? list[0]
  const ent = inc?.entityId ? st.aircraft[inc.entityId] : null
  const tr = inc?.entityId ? st.tracks[st.trackByEntity[inc.entityId]] : null
  const open = st.incidents.filter((i) => i.closed === null)
  const ST: Record<string, string> = { OPEN: 'var(--red)', ACKNOWLEDGED: 'var(--amber)', RESOLVED: 'var(--green)', FAILED: 'var(--red)', 'STOOD DOWN': 'var(--dim)' }
  return (
    <div className="col">
      <div className="toolbar"><span>OPEN <b className={open.length ? 'alert' : 'ok'}>{open.length}</b></span><span>UNACKED <b className={open.some((i) => !i.acked) ? 'alert' : 'ok'}>{open.filter((i) => !i.acked).length}</b></span><button className={`chip ${all ? 'on' : ''}`} onClick={() => setAll(!all)}>SHOW CLOSED</button></div>
      <div className="scroll"><table className="grid"><thead><tr><th>ID</th><th>SEV</th><th>INCIDENT</th><th>OPEN</th><th>STATUS</th></tr></thead>
        <tbody>{list.map((i) => <tr key={i.id} className={inc?.id === i.id ? 'sel' : ''} onClick={() => { store.sel.incident = i.id; if (i.entityId) { const t = st.tracks[st.trackByEntity[i.entityId]]; if (t && !t.dropped) store.select(t.id); else store.notify() } else store.notify() }}>
          <td>{i.id}</td><td style={{ color: i.severity === 3 ? 'var(--red)' : i.severity === 2 ? 'var(--amber)' : 'var(--green)' }}>{'●'.repeat(i.severity)}</td><td>{i.title}</td><td>{hm(i.opened)}</td><td style={{ color: ST[i.status] }}>{i.status}</td></tr>)}</tbody></table>
        {!list.length && <div className="empty">NO {all ? '' : 'OPEN '}INCIDENTS</div>}</div>
      {inc && <div className="detail">
        <div className="hdr"><b>{inc.id}</b> {inc.title}</div>
        <div className="kv"><span>REQUIRED</span><b>{inc.needs}</b></div>
        {inc.closed === null && <div className="kv"><span>DEADLINE</span><b className={st.t > inc.deadline ? 'alert' : ''}>{hm(inc.deadline)}{st.t > inc.deadline ? ' OVERDUE' : ''}</b></div>}
        {inc.result && <div className="kv"><span>OUTCOME</span><b style={{ color: ST[inc.status] }}>{inc.result}</b></div>}
        <div className="btns">
          <Btn kind="ok" onClick={() => store.dispatch({ c: 'ack', incidentId: inc.id })} disabled={inc.acked || inc.closed !== null}>ACKNOWLEDGE</Btn>
          {(inc.kind === 'EMERGENCY_7700' || inc.kind === 'UNLAWFUL_7500') && ent && <Btn kind="warn" onClick={() => store.dispatch({ c: 'alertAirfield', incidentId: inc.id })} disabled={inc.actioned || inc.closed !== null}>ALERT {(ent.emergency?.divertTo ?? ent.nav.dest) ? AIRPORT_MAP[(ent.emergency?.divertTo ?? ent.nav.dest)!]?.icao : 'AIRFIELD'}</Btn>}
          {inc.kind === 'UNLAWFUL_7500' && tr && <Btn onClick={() => store.dispatch({ c: 'op', spec: { type: 'SHADOW', trackId: tr.id } })}>TASK SHADOW</Btn>}
          {tr && !tr.dropped && <Btn onClick={() => store.centreOn(tr, 150)}>CENTRE</Btn>}
          {inc.radarId && <Btn onClick={() => store.requestPanel('system')}>SYSTEM STATUS</Btn>}
        </div>
        <div className="hist">{inc.log.map((l, i) => <div key={i} className="dim">{l}</div>)}{tr && <div className="dim">Track {tr.id} · {label(st, tr)} · {tr.category}</div>}</div>
      </div>}
    </div>
  )
}

export function SystemStatus() {
  const st = useStore((s) => s.st)!
  const sc = computeScores(st)
  const w = st.weather
  const col = (s: string) => (s === 'OPERATIONAL' ? 'var(--green)' : s === 'DEGRADED' ? 'var(--amber)' : s === 'MAINTENANCE' ? 'var(--cyan)' : 'var(--red)')
  const tracks = Object.values(st.tracks).filter((t) => !t.dropped).length
  return (
    <div className="col">
      <div className="scroll">
        <div className="sect">RADAR NETWORK · ENGINEERS FREE {st.engineersFree}/{st.engineersTotal}</div>
        <table className="grid"><thead><tr><th>STATION</th><th>STATUS</th><th>COND</th><th>INTF</th><th>HITS</th><th>RNG</th><th></th></tr></thead>
          <tbody>{st.radars.map((r) => <tr key={r.id} className={store.ringOrigin === r.id ? 'sel' : ''} onClick={() => { if (!r.airborne) store.ringOrigin = r.id; store.notify() }}>
            <td>{r.name.replace('RRH ', '')}</td><td style={{ color: col(r.status) }} title={r.note}>{r.status}{r.status === 'MAINTENANCE' ? ` ${Math.max(0, Math.round((r.repairUntil - st.t) / 60))}m` : ''}</td>
            <td><Bar v={r.condition / 100} warn={0.5} crit={0.3} label={Math.round(r.condition) + ''} /></td><td className={r.interference > 0.1 ? 'alert' : ''}>{r.interference > 0.01 ? Math.round(r.interference * 100) + '%' : '—'}</td>
            <td>{r.hits}</td><td>{r.primaryRange}</td>
            <td>{!r.airborne && <>{<Btn onClick={() => { const e = store.dispatch({ c: 'engineers', radarId: r.id, kind: r.status === 'OPERATIONAL' ? 'PM' : 'REPAIR' }); store.stepMsg = e ?? ''; store.notify() }} disabled={r.status === 'MAINTENANCE'}>{r.status === 'OPERATIONAL' ? 'PM' : 'REPAIR'}</Btn>}</>}</td></tr>)}</tbody></table>
        <div className="dim">Click a ground station to set it as the range-ring origin. Notes: {st.radars.filter((r) => !r.airborne && r.note !== 'Nominal').map((r) => `${r.id}: ${r.note}`).join(' · ') || 'all nominal'}</div>
        {store.stepMsg && <div className="alert">{store.stepMsg}</div>}
        <div className="sect">ENVIRONMENT</div>
        <div className="grid2"><div className="kv"><span>WIND</span><b>{Math.round(w.windDir)}° / {Math.round(w.windKt)}KT</b></div><div className="kv"><span>VISIBILITY</span><b>{w.visibilityKm.toFixed(0)}KM</b></div>
          <div className="kv"><span>WX SEVERITY</span><b>{Math.round(w.severity * 100)}% · {w.cells.length} CELLS</b></div><div className="kv"><span>SIM CLOCK</span><b>{hms(st.t)}Z</b></div>
          <div className="kv"><span>AIRCRAFT / TRACKS</span><b>{Object.keys(st.aircraft).length} / {tracks}</b></div><div className="kv"><span>TENSION</span><b>{Math.round(st.tension * 100)}%</b></div></div>
        <div className="sect">PERFORMANCE (LIVE)</div>
        <div className="grid2">{(['identification', 'awareness', 'resources', 'incidents'] as const).map((k) => <div className="kv" key={k}><span>{k.toUpperCase()}</span><Bar v={sc[k] / 100} warn={0.7} crit={0.5} label={sc[k] + ''} /></div>)}
          <div className="kv"><span>OVERALL</span><b>{sc.overall} · GRADE {sc.grade}</b></div></div>
        {sc.notes.map((n, i) => <div key={i} className="alert">• {n}</div>)}
      </div>
    </div>
  )
}

export function Watch() {
  const st = useStore((s) => s.st)!
  const cs = currentStep(st)
  const sc = st.cfg.scenarioId ? SCENARIO_MAP[st.cfg.scenarioId] : null
  const hint = mentorHint(st)
  const elapsed = st.t - st.startT, limit = st.flags.limit as number | undefined
  const sel = store.sel.track ? st.tracks[store.sel.track] : null
  return (
    <div className="col">
      <div className="scroll">
        <div className="sect">WATCH · {st.cfg.mode}{sc ? ' · ' + sc.title : cs ? ' · ' + cs.lesson.title : ''}</div>
        <div className="kv"><span>ELAPSED</span><b>{Math.floor(elapsed / 3600)}h {String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}m{limit ? ` of ${Math.round(limit / 60)}m` : ''}</b></div>
        {cs && <>
          <p className="dim">{cs.lesson.intro}</p>
          {cs.lesson.steps.map((s, i) => <div key={s.id} className={`step ${i < cs.index ? 'done' : i === cs.index ? 'cur' : ''}`}>{i < cs.index ? '✓' : i === cs.index ? '▶' : '○'} {s.text}</div>)}
          {!cs.step && <div className="ok">LESSON COMPLETE — end the watch to record progress.</div>}
        </>}
        {st.objectives.length > 0 && <><div className="sect">OBJECTIVES</div>{st.objectives.map((o) => <div key={o.id} className={`step ${o.done ? 'done' : o.failed ? 'fail' : ''}`}>{o.done ? '✓' : o.failed ? '✗' : '○'} {o.text}{o.optional ? ' (optional)' : ''}</div>)}</>}
        <div className="sect">MENTOR</div>
        <div className="mentor">{hint}</div>
        {sel && <div className="dim">Selected {sel.id} {label(st, sel)}: {sel.flags.length ? sel.flags.join('; ') : 'no conflicts flagged'}</div>}
        <div className="btns"><Btn kind="danger" onClick={() => { if (confirm('End the watch and view the debrief?')) store.endWatch() }}>END WATCH</Btn></div>
      </div>
    </div>
  )
}

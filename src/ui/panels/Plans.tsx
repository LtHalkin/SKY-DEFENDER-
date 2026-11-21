import { useMemo, useState } from 'react'
import { REGISTRY, searchRegistry } from '../../sim/data/registry'
import { CIV_TYPES } from '../../sim/data/aircraftTypes'
import { store, useStore } from '../store'
import { hm } from '../common'

export function FlightPlans() {
  const st = useStore((s) => s.st)!
  const [tab, setTab] = useState<'PLANS' | 'REGISTRY'>('PLANS')
  const [q, setQ] = useState(''); const [status, setStatus] = useState('ACTIVE')
  const [rq, setRq] = useState(''); const [rsel, setRsel] = useState<string | null>(null)
  const selPlan = useStore((s) => s.sel.plan)
  const plans = useMemo(() => {
    let r = Object.values(st.plans).filter((p) => !p.held)
    if (status !== 'ALL') r = r.filter((p) => p.status === status)
    const s = q.trim().toUpperCase(); if (s) r = r.filter((p) => p.callsign.includes(s) || p.reg.includes(s) || p.dep === s || p.arr === s || p.squawk === s)
    return r.sort((a, b) => a.etd - b.etd)
  }, [st.tick, q, status, st])
  const held = Object.values(st.plans).filter((p) => p.held && p.amended !== 'NOFILE' && (p.status === 'ACTIVE' || p.status === 'FILED')).length
  const plan = selPlan ? st.plans[selPlan] : null
  const trackOf = (pid: string) => Object.values(st.tracks).find((t) => t.autoPlanId === pid && !t.dropped)
  const reg = useMemo(() => searchRegistry(rq, 80), [rq])
  const rrec = rsel ? REGISTRY.find((r) => r.reg === rsel) : null
  return (
    <div className="col">
      <div className="toolbar">
        <button className={`chip ${tab === 'PLANS' ? 'on' : ''}`} onClick={() => setTab('PLANS')}>FLIGHT PLANS ({Object.values(st.plans).filter((p) => !p.held && (p.status === 'ACTIVE' || p.status === 'FILED')).length})</button>
        <button className={`chip ${tab === 'REGISTRY' ? 'on' : ''}`} onClick={() => setTab('REGISTRY')}>AIRCRAFT REGISTER ({REGISTRY.length})</button>
        {tab === 'PLANS' ? <>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{['ACTIVE', 'FILED', 'CLOSED', 'ALL'].map((s) => <option key={s}>{s}</option>)}</select>
          <input placeholder="CALLSIGN / REG / ICAO / SQK" value={q} onChange={(e) => setQ(e.target.value)} />
        </> : <input placeholder="REG / ICAO24 / OPERATOR / TYPE" value={rq} onChange={(e) => { setRq(e.target.value); store.ui('registrySearch') }} />}
      </div>
      {tab === 'PLANS' ? <>
        <div className="scroll"><table className="grid"><thead><tr><th>CALLSIGN</th><th>TYPE</th><th>ROUTE</th><th>RFL</th><th>SSR</th><th>ETD</th><th>ETA</th><th>STATUS</th><th>TRK</th></tr></thead>
          <tbody>{plans.slice(0, 200).map((p) => { const t = trackOf(p.id); return <tr key={p.id} className={selPlan === p.id ? 'sel' : ''} onClick={() => { store.sel.plan = p.id; store.ui('planSelect'); if (t) store.select(t.id); else store.notify() }}>
            <td>{p.callsign}</td><td>{p.typeId}</td><td>{p.dep}-{p.arr}</td><td>{p.rules === 'VFR' ? 'VFR' : 'F' + Math.round(p.rfl / 100)}</td><td>{p.squawk}</td><td>{hm(p.etd)}</td><td>{hm(p.eta)}</td><td className={p.status === 'ACTIVE' ? 'ok' : 'dim'}>{p.status}{p.amended?.startsWith('AMEND') ? '*' : ''}</td><td>{t?.id ?? ''}</td></tr> })}</tbody></table>
          {!plans.length && <div className="empty">NO PLANS</div>}
        </div>
        {held > 0 && <div className="dim">⚠ Area control reports flight plan distribution issues — some active flights may not appear here.</div>}
        {plan && <div className="detail"><div className="hdr"><b>{plan.callsign}</b> {plan.typeName} · {plan.reg} · {plan.operator}</div>
          <div>ROUTE: {plan.route.map((w) => w.name).join(' → ')}</div><div className="dim">{plan.remarks || 'NO REMARKS'} {plan.amended && plan.amended !== 'NOFILE' ? '· ' + plan.amended : ''}</div></div>}
      </> : <>
        <div className="scroll"><table className="grid"><thead><tr><th>REG</th><th>TYPE</th><th>OPERATOR</th><th>ICAO24</th><th>BUILT</th></tr></thead>
          <tbody>{reg.map((r) => <tr key={r.reg} className={rsel === r.reg ? 'sel' : ''} onClick={() => setRsel(r.reg)}><td>{r.reg}</td><td>{r.typeId}</td><td>{r.operator}</td><td>{r.icao24}</td><td>{r.built}</td></tr>)}</tbody></table></div>
        {rrec && <div className="detail"><div className="hdr"><b>{rrec.reg}</b> {CIV_TYPES[rrec.typeId]?.name}</div><div>Operator: {rrec.operator} · MSN {rrec.msn} · Built {rrec.built} · Base {rrec.homeBase}</div><div className="dim">Mode S address {rrec.icao24} · cruise {CIV_TYPES[rrec.typeId]?.cruiseKt}kt · ceiling FL{CIV_TYPES[rrec.typeId]?.maxFL}</div></div>}
      </>}
    </div>
  )
}

import { ASSET_TYPES } from '../../sim/data/aircraftTypes'
import { bingoFuel, canLaunch, fuelPct } from '../../sim/assets'
import { store, useStore } from '../store'
import { Bar, Btn, dur, tonnes } from '../common'
import type { Asset } from '../../sim/types'

const SC: Record<string, string> = { READY: 'var(--green)', LAUNCHING: 'var(--amber)', AIRBORNE: 'var(--cyan)', RETURNING: 'var(--amber)', TURNAROUND: 'var(--dim)', MAINT: 'var(--amber)', US: 'var(--red)' }
export function Assets() {
  const st = useStore((s) => s.st)!
  const selId = useStore((s) => s.sel.asset)
  const list = Object.values(st.assets).sort((a, b) => (a.baseId + a.typeId).localeCompare(b.baseId + b.typeId))
  const sel = selId ? st.assets[selId] : null
  const task = (type: string, a: Asset) => { store.opsDraft = { type, assetId: a.id }; store.requestPanel('ops') }
  const ready = list.filter((a) => a.status === 'READY').length, air = list.filter((a) => a.ac).length
  return (
    <div className="col">
      <div className="toolbar"><span>READY <b className="ok">{ready}</b></span><span>AIRBORNE <b className="cyan">{air}</b></span><span>MAINT/US <b className="alert">{list.filter((a) => a.status === 'MAINT' || a.status === 'US').length}</b></span><span>TOTAL {list.length}</span></div>
      <div className="scroll"><table className="grid"><thead><tr><th>CALL</th><th>TYPE</th><th>BASE</th><th>STATUS</th><th>RDY</th><th>FUEL</th><th>SVC</th><th>OP</th></tr></thead>
        <tbody>{list.map((a) => <tr key={a.id} className={selId === a.id ? 'sel' : ''} onClick={() => { store.sel.asset = a.id; store.notify(); if (a.ac) store.centreOn(a.ac) }}>
          <td>{a.callsign}</td><td>{ASSET_TYPES[a.typeId].short}</td><td>{a.locationId ?? '→' + (a.ac?.nav.dest ?? '')}{a.locationId && a.locationId !== a.baseId ? '*' : ''}</td><td style={{ color: SC[a.status] }}>{a.status}</td>
          <td>{a.readiness}</td><td><Bar v={fuelPct(a)} label={tonnes(a.fuelKg)} /></td><td>{Math.max(0, a.serviceHrs).toFixed(0)}h</td><td>{a.opId ?? ''}</td></tr>)}</tbody></table></div>
      {sel && (
        <div className="detail">
          <div className="hdr"><b>{sel.callsign}</b> {ASSET_TYPES[sel.typeId].name} · {sel.tail} · base {sel.baseId}</div>
          <div className="kv"><span>STATE</span><b style={{ color: SC[sel.status] }}>{sel.status}{sel.status === 'MAINT' || sel.status === 'TURNAROUND' ? (sel.busyUntil > st.t ? ` · ${dur(sel.busyUntil - st.t)} remaining` : ' · queued') : ''}{sel.status === 'LAUNCHING' && sel.launchAt ? ` · airborne in ${dur(sel.launchAt - st.t)}` : ''}</b></div>
          {sel.defect && <div className="alert">{sel.defect}</div>}
          {sel.ac && <div className="kv"><span>ENDURANCE / BINGO</span><b>{(sel.fuelKg / ASSET_TYPES[sel.typeId].burnCruise).toFixed(1)}h · bingo {tonnes(bingoFuel(st, sel))}</b></div>}
          {sel.cargo && <div className="kv"><span>CARGO</span><b>{sel.cargo.qty} {sel.cargo.kind} → {sel.cargo.to}</b></div>}
          <div className="btns">
            {(['R5', 'R30', 'R60'] as const).map((r) => <Btn key={r} kind={sel.readiness === r ? 'ok' : undefined} onClick={() => store.dispatch({ c: 'readiness', assetId: sel.id, state: r })}>{r}</Btn>)}
            <span className="dim">launch delay {sel.readiness === 'R5' ? '2' : sel.readiness === 'R30' ? '5' : '10'} min</span>
          </div>
          <div className="btns">
            <Btn onClick={() => task('PATROL', sel)} disabled={!!canLaunch(st, sel) && !sel.ac}>PATROL…</Btn>
            <Btn onClick={() => task('FERRY', sel)}>FERRY…</Btn>
            <Btn onClick={() => task('SUPPLY', sel)} disabled={ASSET_TYPES[sel.typeId].cargo === 0}>SUPPLY…</Btn>
            <Btn onClick={() => task('REFUEL', sel)} disabled={!sel.ac}>REFUEL…</Btn>
            <Btn kind="warn" onClick={() => store.dispatch({ c: 'op', spec: { type: 'RETURN', assetId: sel.id } })} disabled={!sel.ac}>RETURN TO BASE</Btn>
          </div>
          {canLaunch(st, sel) && sel.status === 'READY' && <div className="alert">{canLaunch(st, sel)}</div>}
        </div>)}
    </div>
  )
}

export function Airfields() {
  const st = useStore((s) => s.st)!
  const selId = useStore((s) => s.sel.airfield)
  const afs = Object.values(st.airfields)
  const sel = selId ? st.airfields[selId] : null
  const here = (icao: string) => Object.values(st.assets).filter((a) => a.locationId === icao)
  return (
    <div className="col">
      <div className="scroll"><table className="grid"><thead><tr><th>AIRFIELD</th><th>STATE</th><th>FUEL</th><th>SPARES</th><th>BOWS</th><th>ENGR</th><th>RDY/TOT</th></tr></thead>
        <tbody>{afs.map((f) => { const h = here(f.icao); return <tr key={f.icao} className={selId === f.icao ? 'sel' : ''} onClick={() => { store.sel.airfield = f.icao; store.notify() }}>
          <td>{f.name.replace('RAF ', '')} <span className="dim">{f.icao}</span></td><td className={f.open ? 'ok' : 'alert'}>{f.open ? 'OPEN' : 'CLOSED'}{f.alert ? ' ⚠' : ''}</td>
          <td><Bar v={f.fuelKg / f.fuelCap} label={tonnes(f.fuelKg)} /></td><td className={f.spares < 6 ? 'alert' : ''}>{f.spares}</td><td>{f.bowsersBusy}/{f.bowsers}</td><td>{f.engineersBusy}/{f.engineers}</td><td>{h.filter((a) => a.status === 'READY').length}/{h.length}</td></tr> })}</tbody></table></div>
      {sel && <div className="detail">
        <div className="hdr"><b>{sel.name}</b> · fuel {tonnes(sel.fuelKg)} of {tonnes(sel.fuelCap)} · spares {sel.spares}</div>
        <div className="btns">
          <Btn onClick={() => { store.opsDraft = { type: 'SUPPLY', toBase: sel.icao }; store.requestPanel('ops') }}>REQUEST SUPPLY…</Btn>
          <Btn kind={sel.open ? 'warn' : 'ok'} onClick={() => store.dispatch({ c: 'closeAirfield', icao: sel.icao, open: !sel.open })}>{sel.open ? 'CLOSE AIRFIELD' : 'REOPEN'}</Btn>
          <Btn onClick={() => store.centreOn(sel, 120)}>CENTRE</Btn>
        </div>
        <table className="grid"><tbody>{here(sel.icao).map((a) => <tr key={a.id} onClick={() => { store.sel.asset = a.id; store.requestPanel('assets') }}><td>{a.callsign}</td><td>{ASSET_TYPES[a.typeId].short}</td><td style={{ color: SC2[a.status] }}>{a.status}</td><td>{tonnes(a.fuelKg)}</td></tr>)}</tbody></table>
        <div className="dim">Bowsers refuel one aircraft each; engineers and spares are consumed by maintenance. Fuel is only replenished by supply flights.</div>
      </div>}
    </div>
  )
}
const SC2: Record<string, string> = { READY: 'var(--green)', LAUNCHING: 'var(--amber)', AIRBORNE: 'var(--cyan)', RETURNING: 'var(--amber)', TURNAROUND: 'var(--dim)', MAINT: 'var(--amber)', US: 'var(--red)' }

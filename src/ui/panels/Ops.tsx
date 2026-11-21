import { useEffect, useState } from 'react'
import { ASSET_TYPES } from '../../sim/data/aircraftTypes'
import { fmtPos } from '../../sim/geo'
import { label } from '../../sim/identification'
import { opLabel } from '../../sim/operations'
import type { OpType } from '../../sim/types'
import { store, useStore } from '../store'
import { Btn, hm } from '../common'

const TYPES: OpType[] = ['IDENTIFY', 'MONITOR', 'SHADOW', 'PATROL', 'RETURN', 'REFUEL', 'FERRY', 'SUPPLY']
const PRESETS: Record<string, { lat: number; lon: number }> = {
  'NORTH SEA CAP (56N 001E)': { lat: 56, lon: 1 }, 'ATLANTIC GAP (57N 014W)': { lat: 57, lon: -14 }, 'FAEROES GAP (61N 006W)': { lat: 61, lon: -6 }, 'IRISH SEA (54N 005W)': { lat: 54, lon: -5 }, 'WESTERN APPROACHES (50N 009W)': { lat: 50, lon: -9 }, 'CHANNEL (50N 000E)': { lat: 50.2, lon: 0 },
}
export function Operations() {
  const st = useStore((s) => s.st)!
  const draft = store.opsDraft
  const [type, setType] = useState<OpType>((draft.type as OpType) ?? 'IDENTIFY')
  const [assetId, setAssetId] = useState<string>(draft.assetId ?? '')
  const [tanker, setTanker] = useState('')
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [radius, setRadius] = useState(18); const [dmin, setDmin] = useState(60); const [delay, setDelay] = useState(0)
  const [toBase, setToBase] = useState<string>(draft.toBase ?? ''); const [ck, setCk] = useState<'FUEL' | 'SPARES'>('FUEL'); const [qty, setQty] = useState(15000)
  const [relief, setRelief] = useState(true); const [err, setErr] = useState(''); const [show, setShow] = useState<'ACTIVE' | 'ALL'>('ACTIVE')
  const [trackId, setTrackId] = useState('')
  const selTrack = useStore((s) => s.sel.track)
  useEffect(() => { if (store.opsDraft.type) { setType(store.opsDraft.type); setAssetId(store.opsDraft.assetId ?? ''); setToBase(store.opsDraft.toBase ?? ''); store.opsDraft = {} } }, [store.version])
  const assets = Object.values(st.assets)
  const eligible = assets.filter((a) => {
    const role = ASSET_TYPES[a.typeId].role
    if (type === 'IDENTIFY' || type === 'SHADOW') return role === 'FIGHTER' && (a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId))
    if (type === 'MONITOR') return ['AEW', 'ELINT', 'FIGHTER'].includes(role) && (a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId))
    if (type === 'PATROL') return role !== 'TRANSPORT' && (a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId))
    if (type === 'RETURN') return !!a.ac
    if (type === 'REFUEL') return !!a.ac && role !== 'TANKER' && role !== 'HELO'
    if (type === 'FERRY') return a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId)
    if (type === 'SUPPLY') return a.status === 'READY' && ASSET_TYPES[a.typeId].cargo > 0
    return true
  })
  const tankers = assets.filter((a) => ASSET_TYPES[a.typeId].role === 'TANKER' && (a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId)))
  const tracks = Object.values(st.tracks).filter((t) => !t.dropped && st.aircraft[t.entityId]?.kind !== 'asset').sort((a, b) => ['SUSPICIOUS', 'UNRESOLVED', 'UNKNOWN', 'UNCORRELATED', 'CORRELATED', 'IDENTIFIED'].indexOf(a.category) - ['SUSPICIOUS', 'UNRESOLVED', 'UNKNOWN', 'UNCORRELATED', 'CORRELATED', 'IDENTIFIED'].indexOf(b.category))
  const tid = trackId || selTrack || tracks[0]?.id || ''
  const needTrack = type === 'IDENTIFY' || type === 'SHADOW' || type === 'MONITOR'
  const create = () => {
    setErr('')
    const spec: any = { type, assetId: assetId || undefined }
    if (needTrack) spec.trackId = tid
    if (type === 'PATROL') { spec.point = point; spec.radius = radius; spec.durationMin = dmin; spec.startDelayMin = delay; spec.autoRelief = relief }
    if (type === 'MONITOR' || type === 'SHADOW') spec.durationMin = dmin
    if (type === 'REFUEL') { spec.tankerId = tanker || undefined; spec.point = point ?? undefined }
    if (type === 'FERRY') spec.toBase = toBase
    if (type === 'SUPPLY') { spec.toBase = toBase; spec.cargo = { kind: ck, qty } }
    if (type === 'RETURN') spec.toBase = toBase || undefined
    const r = store.dispatch({ c: 'op', spec }); if (r) setErr(r)
  }
  const pickPoint = () => { store.pick = { kind: 'point', label: 'SELECT POINT', cb: (p) => { setPoint(p); store.notify() } }; store.notify() }
  const ops = Object.values(st.ops).filter((o) => show === 'ALL' || o.status === 'ACTIVE' || o.status === 'PLANNED').sort((a, b) => b.created - a.created)
  return (
    <div className="col">
      <div className="form">
        <div className="frow"><label>OPERATION</label><select value={type} onChange={(e) => setType(e.target.value as OpType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        {needTrack && <div className="frow"><label>TARGET</label><select value={tid} onChange={(e) => setTrackId(e.target.value)}>{tracks.slice(0, 80).map((t) => <option key={t.id} value={t.id}>{t.id} {label(st, t)} {t.category}</option>)}</select></div>}
        <div className="frow"><label>{type === 'REFUEL' ? 'RECEIVER' : 'ASSET'}</label><select value={assetId} onChange={(e) => setAssetId(e.target.value)}>{type !== 'RETURN' && type !== 'REFUEL' && type !== 'FERRY' && type !== 'SUPPLY' && <option value="">AUTO-SELECT BEST</option>}{type !== 'RETURN' && (type === 'REFUEL' || type === 'FERRY' || type === 'SUPPLY') && <option value="">— select —</option>}{type === 'RETURN' && <option value="">— select —</option>}{eligible.map((a) => <option key={a.id} value={a.id}>{a.callsign} {ASSET_TYPES[a.typeId].short} {a.locationId ?? 'AIRBORNE'} {Math.round(a.fuelKg / 100) / 10}t {a.status}</option>)}</select></div>
        {type === 'REFUEL' && <div className="frow"><label>TANKER</label><select value={tanker} onChange={(e) => setTanker(e.target.value)}><option value="">AUTO-SELECT</option>{tankers.map((a) => <option key={a.id} value={a.id}>{a.callsign} {ASSET_TYPES[a.typeId].short} {a.locationId ?? 'AIRBORNE'}</option>)}</select></div>}
        {(type === 'PATROL' || type === 'REFUEL') && <div className="frow"><label>{type === 'REFUEL' ? 'RENDEZVOUS' : 'STATION'}</label><span><Btn onClick={pickPoint}>PICK ON MAP</Btn> <select value="" onChange={(e) => { if (e.target.value) { setPoint(PRESETS[e.target.value]) } }}><option value="">PRESET…</option>{Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}</select> <span className="dim">{point ? fmtPos(point) : type === 'REFUEL' ? 'midpoint (default)' : 'not set'}</span></span></div>}
        {type === 'PATROL' && <div className="frow"><label>RADIUS / DUR / START</label><span><input type="number" value={radius} min={5} max={60} onChange={(e) => setRadius(+e.target.value)} /> NM <input type="number" value={dmin} min={10} max={600} onChange={(e) => setDmin(+e.target.value)} /> MIN <input type="number" value={delay} min={0} max={720} onChange={(e) => setDelay(+e.target.value)} /> +MIN</span></div>}
        {type === 'PATROL' && <div className="frow"><label>AUTO-RELIEF</label><input type="checkbox" checked={relief} onChange={(e) => setRelief(e.target.checked)} /><span className="dim">task a replacement at bingo</span></div>}
        {(type === 'MONITOR' || type === 'SHADOW') && <div className="frow"><label>DURATION</label><span><input type="number" value={dmin} min={10} max={600} onChange={(e) => setDmin(+e.target.value)} /> MIN</span></div>}
        {(type === 'FERRY' || type === 'SUPPLY' || type === 'RETURN') && <div className="frow"><label>{type === 'RETURN' ? 'LAND AT' : 'DESTINATION'}</label><select value={toBase} onChange={(e) => setToBase(e.target.value)}><option value="">{type === 'RETURN' ? 'HOME / NEAREST' : '— select —'}</option>{Object.values(st.airfields).map((f) => <option key={f.icao} value={f.icao}>{f.name} {f.open ? '' : '(CLOSED)'}</option>)}</select></div>}
        {type === 'SUPPLY' && <div className="frow"><label>CARGO</label><span><select value={ck} onChange={(e) => { setCk(e.target.value as any); setQty(e.target.value === 'FUEL' ? 15000 : 60) }}><option>FUEL</option><option>SPARES</option></select> <input type="number" value={qty} step={ck === 'FUEL' ? 1000 : 10} onChange={(e) => setQty(+e.target.value)} /> {ck === 'FUEL' ? 'KG (max 20000)' : 'UNITS (max 200)'}</span></div>}
        <div className="btns"><Btn kind="ok" onClick={create}>TASK / CREATE</Btn>{err && <span className="alert">✗ {err}</span>}</div>
      </div>
      <div className="toolbar"><span className="sect inl">ACTIVE OPERATIONS</span>
        <button className={`chip ${show === 'ACTIVE' ? 'on' : ''}`} onClick={() => setShow('ACTIVE')}>ACTIVE {Object.values(st.ops).filter((o) => o.status === 'ACTIVE' || o.status === 'PLANNED').length}</button>
        <button className={`chip ${show === 'ALL' ? 'on' : ''}`} onClick={() => setShow('ALL')}>ALL {Object.keys(st.ops).length}</button></div>
      <div className="scroll oplist">
        {ops.map((o) => <div key={o.id} className={`op ${o.status}`}>
          <div className="ophead"><b>{o.id}</b> <span className="optype">{opLabel(st, o)}</span> <span className={`st-${o.status}`}>{o.status}</span> <span className="dim">{o.assets.map((a) => st.assets[a]?.callsign).join(' + ')}</span>
            {(o.status === 'ACTIVE' || o.status === 'PLANNED') && <Btn kind="danger" onClick={() => store.dispatch({ c: 'abortOp', opId: o.id })}>ABORT</Btn>}</div>
          <div className="stages">{o.stages.map((s, i) => <span key={i} className={i < o.stage ? 'done' : i === o.stage && o.status !== 'COMPLETE' ? 'cur' : o.status === 'COMPLETE' ? 'done' : ''}>{s}</span>)}</div>
          <div className="dim">{o.result || o.log[o.log.length - 1]} {o.status === 'PLANNED' && o.data.startAt ? `· starts ${hm(o.data.startAt as number)}` : ''}</div>
        </div>)}
        {!ops.length && <div className="empty">NO OPERATIONS</div>}
      </div>
    </div>
  )
}

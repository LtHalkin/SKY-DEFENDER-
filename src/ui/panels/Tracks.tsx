import { useMemo, useState } from 'react'
import { label, evidence, planFor } from '../../sim/identification'
import { fmtPos, distNm, bearingDeg } from '../../sim/geo'
import { ASSET_TYPES } from '../../sim/data/aircraftTypes'
import { intelFor } from '../../sim/events'
import type { Category, Track } from '../../sim/types'
import { store, useStore } from '../store'
import { Badge, Btn, CAT_COL, fl, hms } from '../common'

const CATS: (Category | 'ALL' | 'OPEN')[] = ['ALL', 'OPEN', 'UNKNOWN', 'UNCORRELATED', 'CORRELATED', 'IDENTIFIED', 'SUSPICIOUS', 'UNRESOLVED']
export function TrackList() {
  const st = useStore((s) => s.st)!
  const [filter, setFilter] = useState<(typeof CATS)[number]>('ALL')
  const [q, setQ] = useState(''); const [sort, setSort] = useState<{ k: string; d: number }>({ k: 'pri', d: 1 })
  const sel = useStore((s) => s.sel.track)
  const rows = useMemo(() => {
    let r = Object.values(st.tracks).filter((t) => !t.dropped)
    if (filter === 'OPEN') r = r.filter((t) => ['UNKNOWN', 'UNCORRELATED', 'UNRESOLVED', 'SUSPICIOUS'].includes(t.category))
    else if (filter !== 'ALL') r = r.filter((t) => t.category === filter)
    const s = q.trim().toUpperCase()
    if (s) r = r.filter((t) => t.id.includes(s) || label(st, t).toUpperCase().includes(s) || (t.squawk ?? '').includes(s))
    const pri = (t: Track) => ({ SUSPICIOUS: 0, UNRESOLVED: 1, UNKNOWN: 2, UNCORRELATED: 3, CORRELATED: 4, IDENTIFIED: 5 }[t.category] - (t.squawk && /^7[567]00$/.test(t.squawk) ? 10 : 0) - t.flags.length * 0.1)
    const key: Record<string, (t: Track) => number | string> = { pri, id: (t) => t.id, cs: (t) => label(st, t), cat: (t) => t.category, fl: (t) => t.alt ?? -1, gs: (t) => t.gs, sq: (t) => t.squawk ?? '' }
    const f = key[sort.k] ?? pri
    return r.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d })
  }, [st.tick, filter, q, sort, st])
  const th = (k: string, t: string) => <th onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : 1 }))} className="sortable">{t}{sort.k === k ? (sort.d > 0 ? '▲' : '▼') : ''}</th>
  const counts: Record<string, number> = {}; for (const t of Object.values(st.tracks)) if (!t.dropped) counts[t.category] = (counts[t.category] ?? 0) + 1
  return (
    <div className="col">
      <div className="toolbar">
        {CATS.map((c) => <button key={c} className={`chip ${filter === c ? 'on' : ''}`} style={c !== 'ALL' && c !== 'OPEN' ? { color: CAT_COL[c as Category] } : undefined} onClick={() => setFilter(c)}>{c === 'ALL' ? `ALL ${Object.values(st.tracks).filter((t) => !t.dropped).length}` : c === 'OPEN' ? 'OPEN' : `${c.slice(0, 5)} ${counts[c] ?? 0}`}</button>)}
        <input placeholder="SEARCH CALLSIGN / SQK / TRK" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="scroll"><table className="grid"><thead><tr>{th('id', 'TRK')}{th('cs', 'IDENT')}{th('cat', 'CLASS')}{th('fl', 'LEVEL')}{th('gs', 'GS')}<th>HDG</th>{th('sq', 'SSR')}<th>SRC</th><th>FLG</th></tr></thead>
        <tbody>{rows.slice(0, 250).map((t) => (
          <tr key={t.id} className={sel === t.id ? 'sel' : ''} onClick={() => store.select(t.id)} onDoubleClick={() => store.centreOn(t)}>
            <td>{t.id}</td><td style={{ color: CAT_COL[t.category] }}>{label(st, t)}</td><td><Badge cat={t.category} /></td>
            <td>{t.altEst ? '~' : ''}{fl(t.alt)}{t.vs > 300 ? '↑' : t.vs < -300 ? '↓' : ''}</td><td>{Math.round(t.gs)}</td><td>{String(Math.round(t.hdg)).padStart(3, '0')}</td>
            <td className={t.squawk && /^7[567]00$/.test(t.squawk) ? 'alert' : ''}>{t.squawk ?? '----'}</td><td>{t.coasting ? 'CST' : t.sources[0]?.slice(0, 4)}</td><td className={t.flags.length ? 'alert' : ''}>{t.flags.length || ''}</td>
          </tr>))}</tbody></table>
        {!rows.length && <div className="empty">NO TRACKS</div>}
      </div>
    </div>
  )
}

const Ev = { OK: '#4df08a', WARN: '#ffb000', BAD: '#ff5050', INFO: '#9fd8b4', NA: '#5b7a66' } as const
export function TrackDetail() {
  const st = useStore((s) => s.st)!
  const id = useStore((s) => s.sel.track)
  const tr = id ? st.tracks[id] : undefined
  const [asset, setAsset] = useState('')
  const [open, setOpen] = useState(false)
  if (!tr) return <div className="empty">SELECT A TRACK ON THE RADAR OR TRACK LIST</div>
  const ent = st.aircraft[tr.entityId]
  const plan = planFor(st, tr)
  const rows = evidence(st, tr)
  const isAsset = ent?.kind === 'asset'
  const run = (spec: any) => { const r = store.dispatch({ c: 'op', spec: { ...spec, trackId: tr.id, assetId: asset || undefined } }); if (r) store.stepMsg = r; store.notify(); if (!r) store.requestPanel('ops') }
  const fighters = Object.values(st.assets).filter((a) => ASSET_TYPES[a.typeId].role !== 'TRANSPORT' && (a.status === 'READY' || (a.status === 'AIRBORNE' && !a.opId)))
  const o = { lat: 55.42, lon: -1.61 }
  const intel = intelFor(st, tr.id)
  return (
    <div className="col detail">
      <div className="hdr">
        <span className="big" style={{ color: CAT_COL[tr.category] }}>{label(st, tr)}</span> <Badge cat={tr.category} /> <span className="dim">{tr.id}{tr.coasting ? ' · COASTING' : ''}</span>
      </div>
      <div className="grid2">
        <div className="kv"><span>LEVEL</span><b>{tr.altEst ? '~' : ''}{fl(tr.alt)} {tr.vs > 200 ? '▲' : tr.vs < -200 ? '▼' : '▬'} {tr.vs ? Math.abs(tr.vs) + 'fpm' : ''}</b></div>
        <div className="kv"><span>GS / HDG</span><b>{Math.round(tr.gs)}KT / {String(Math.round(tr.hdg)).padStart(3, '0')}°</b></div>
        <div className="kv"><span>POSITION</span><b>{fmtPos(tr)}</b></div>
        <div className="kv"><span>BRG/RNG BOULMER</span><b>{String(Math.round(bearingDeg(o, tr))).padStart(3, '0')}° / {Math.round(distNm(o, tr))}NM</b></div>
        <div className="kv"><span>SSR / MODE S</span><b>{tr.squawk ?? '----'} / {tr.ms ? `${tr.ms.callsign} ${tr.ms.icao24}` : '—'}</b></div>
        <div className="kv"><span>SOURCES / QUALITY</span><b>{tr.sources.join(',') || '—'} / Q{tr.quality}</b></div>
        {plan && <div className="kv"><span>PLAN</span><b>{plan.callsign} {plan.typeId} {plan.dep}→{plan.arr}</b></div>}
        {tr.vid && <div className="kv full"><span>VISUAL ID</span><b className="ok">{tr.vid.text}</b></div>}
      </div>
      {!isAsset && <>
        <div className="sect">EVIDENCE — COMPARE SOURCES</div>
        <table className="grid ev"><tbody>{rows.map((r, i) => <tr key={i}><td style={{ color: Ev[r.status] }}>{r.status === 'OK' ? '✓' : r.status === 'BAD' ? '✗' : r.status === 'WARN' ? '!' : '·'}</td><td className="dim">{r.label}</td><td style={{ color: Ev[r.status] }}>{r.a}</td><td className="dim">{r.b}</td></tr>)}</tbody></table>
        {intel.length > 0 && <div className="dim">{intel.length} intelligence report(s) refer to this contact area.</div>}
        <div className="sect">CLASSIFY</div>
        <div className="btns">
          <Btn kind="ok" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'IDENTIFIED' })}>IDENTIFIED</Btn>
          <Btn kind="danger" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'SUSPICIOUS' })}>SUSPICIOUS</Btn>
          <Btn onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'UNRESOLVED' })}>UNRESOLVED</Btn>
          <Btn onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'CLUTTER' })} title="Primary return that is not an aircraft">CLUTTER</Btn>
          <Btn onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'CLEAR' })} disabled={!tr.manual}>CLEAR</Btn>
        </div>
        <div className="sect">QUERY</div>
        <div className="btns">
          <Btn onClick={() => store.dispatch({ c: 'atc', trackId: tr.id })}>ATC QUERY</Btn>
          <Btn onClick={() => store.dispatch({ c: 'registry', trackId: tr.id })}>REGISTRY</Btn>
          <Btn onClick={() => store.dispatch({ c: 'interrogate', trackId: tr.id })} disabled={!tr.squawk}>IDENT / R-T</Btn>
          <Btn onClick={() => store.dispatch({ c: 'watch', trackId: tr.id, on: !tr.watch })}>{tr.watch ? '★ UNWATCH' : '☆ WATCH'}</Btn>
          <Btn onClick={() => store.centreOn(tr, Math.min(store.view.rangeNm, 120))}>CENTRE</Btn>
        </div>
        <div className="sect">TASK AN ASSET</div>
        <div className="btns">
          <select value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">AUTO-SELECT</option>{fighters.map((a) => <option key={a.id} value={a.id}>{a.callsign} {ASSET_TYPES[a.typeId].short} {a.status}</option>)}</select>
          <Btn onClick={() => run({ type: 'IDENTIFY' })}>IDENTIFY</Btn><Btn onClick={() => run({ type: 'SHADOW' })}>SHADOW</Btn><Btn onClick={() => run({ type: 'MONITOR' })}>MONITOR</Btn>
        </div>
        {store.stepMsg && <div className="alert">{store.stepMsg}</div>}
      </>}
      <div className="sect clickable" onClick={() => setOpen(!open)}>{open ? '▼' : '▶'} CONTACT HISTORY ({tr.plots.length} plots)</div>
      {open && <div className="hist">{tr.plots.slice(-14).reverse().map((p, i) => <div key={i}>{hms(p.t)} {fmtPos(p)} {p.alt !== null ? fl(p.alt) : '---'} {p.radar}</div>)}{tr.log.slice(-8).map((l, i) => { const [t, m] = l.split('|'); return <div key={'l' + i} className="dim">{hms(+t)} {m}</div> })}</div>}
    </div>
  )
}

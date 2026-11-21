import { useState } from 'react'
import { areaText } from '../../sim/events'
import { store, useStore } from '../store'
import { Btn, hm } from '../common'

export function Intel() {
  const st = useStore((s) => s.st)!
  const [sel, setSel] = useState<string | null>(null)
  const track = useStore((s) => s.sel.track)
  const list = [...st.intel].reverse()
  const rp = sel ? st.intel.find((i) => i.id === sel) : list[0]
  return (
    <div className="col">
      <div className="scroll"><table className="grid"><thead><tr><th>ID</th><th>TIME</th><th>SOURCE</th><th>GRADE</th><th>ASSESSED</th></tr></thead>
        <tbody>{list.map((i) => <tr key={i.id} className={(rp?.id === i.id ? 'sel ' : '') + (i.assessed ? '' : 'unread')} onClick={() => setSel(i.id)}><td>{i.id}</td><td>{hm(i.t)}</td><td>{i.source}</td><td>{i.grade}</td><td>{i.assessed ?? '—'}</td></tr>)}</tbody></table>
        {!list.length && <div className="empty">NO REPORTS</div>}</div>
      {rp && <div className="detail">
        <div className="hdr"><b>{rp.id}</b> · {rp.source} · grade <b>{rp.grade}</b></div>
        <p>{rp.text}</p>
        {rp.lat !== null && <div className="dim">Area of interest: {areaText({ lat: rp.lat, lon: rp.lon! })} (±{rp.radius}NM) · received {hm(rp.t)}</div>}
        <div className="dim">Grade: source reliability A–F / information credibility 1–6. Reports may be incomplete, conflicting or wrong. Link to the selected track if you believe it concerns that contact.</div>
        <div className="btns">
          <Btn kind="ok" onClick={() => store.dispatch({ c: 'intel', id: rp.id, verdict: 'CREDIBLE', trackId: track })}>CREDIBLE</Btn>
          <Btn kind="warn" onClick={() => store.dispatch({ c: 'intel', id: rp.id, verdict: 'DOUBTFUL', trackId: track })}>DOUBTFUL</Btn>
          <Btn onClick={() => store.dispatch({ c: 'intel', id: rp.id, verdict: 'DISREGARD', trackId: track })}>DISREGARD</Btn>
          {rp.lat !== null && <Btn onClick={() => store.centreOn({ lat: rp.lat!, lon: rp.lon! }, Math.max(150, rp.radius * 2))}>SHOW AREA</Btn>}
        </div>
        {rp.assessed && <div className="dim">Assessed {rp.assessed}{rp.linkedTrack ? ` · linked to ${rp.linkedTrack}` : ''}</div>}
      </div>}
    </div>
  )
}

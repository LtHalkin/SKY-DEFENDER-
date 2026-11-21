import { useEffect, useRef, useState } from 'react'
import geo from '../sim/data/geography.json'
import { AIRPORTS } from '../sim/data/airports'
import { ZONES } from '../sim/data/fixes'
import { ASSET_TYPES } from '../sim/data/aircraftTypes'
import { fmtHM, rad } from '../sim/geo'
import { label, planFor } from '../sim/identification'
import { opLabel } from '../sim/operations'
import { computeScores } from '../sim/scoring'
import type { Track } from '../sim/types'
import { store, useStore } from './store'
import { makeProj } from './RadarCanvas'
import { Btn, hms } from './common'

const COAST = (geo as any).coast as number[][][]
const colourOf = (t: Track) => t.squawk && /^7[567]00$/.test(t.squawk) ? '#ff9a2e' : t.category === 'SUSPICIOUS' || t.category === 'UNRESOLVED' ? '#c77dff' : t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' ? '#ffe34d' : '#f2f2f2'
const word = (t: Track) => t.squawk && /^7[567]00$/.test(t.squawk) ? 'EMERGENCY' : t.category === 'SUSPICIOUS' ? 'SUSPICIOUS' : t.category === 'UNRESOLVED' ? 'UNSURE — check it' : t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' ? 'UNKNOWN — check it!' : 'SAFE'
function plane(ctx: CanvasRenderingContext2D, x: number, y: number, hdg: number, s: number, c: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(hdg)); ctx.fillStyle = c
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.18, -s * 0.2); ctx.lineTo(s * 0.9, s * 0.25); ctx.lineTo(s * 0.9, s * 0.45); ctx.lineTo(s * 0.18, s * 0.2); ctx.lineTo(s * 0.15, s * 0.7); ctx.lineTo(s * 0.45, s * 0.95); ctx.lineTo(s * 0.45, s * 1.1); ctx.lineTo(0, s * 0.95); ctx.lineTo(-s * 0.45, s * 1.1); ctx.lineTo(-s * 0.45, s * 0.95); ctx.lineTo(-s * 0.15, s * 0.7); ctx.lineTo(-s * 0.18, s * 0.2); ctx.lineTo(-s * 0.9, s * 0.45); ctx.lineTo(-s * 0.9, s * 0.25); ctx.lineTo(-s * 0.18, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.restore()
}

export function SimpleGame() {
  const st = useStore((s) => s.st)!
  const ref = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null)
  const hits = useRef<{ id: string; asset?: string; x: number; y: number }[]>([])
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; moved: boolean } | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const speed = useStore((s) => s.speed), paused = useStore((s) => s.paused)
  const selT = useStore((s) => s.sel.track), selA = useStore((s) => s.sel.asset)
  useStore((s) => s.view)

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; let raf = 0, w = 0, h = 0, dpr = 1
    const resize = () => { const r = wrap.current!.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px' }
    resize(); const ro = new ResizeObserver(resize); ro.observe(wrap.current!)
    const frame = () => { raf = requestAnimationFrame(frame); const s = store.st; if (!s) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#06090c'; ctx.fillRect(0, 0, w, h)
      const P = makeProj(w, h); const k = Math.max(1, h / 900)
      ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 1.6; ctx.beginPath()
      for (const line of COAST) { line.forEach((p, i) => (i ? ctx.lineTo(P.x(p[0]), P.y(p[1])) : ctx.moveTo(P.x(p[0]), P.y(p[1])))) }
      ctx.stroke()
      for (const z of ZONES) { const x = P.x(z.lon), y = P.y(z.lat), r = z.r * P.pxPerNm(z.lat); ctx.fillStyle = 'rgba(180,20,20,0.35)'; ctx.strokeStyle = '#d33'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2) }
      ctx.font = `${12 * k}px "Lucida Console",monospace`
      const seen = new Set<string>(); for (const a of AIRPORTS) { if (a.country !== 'GB' && a.country !== 'IE') continue; if (a.size < 3 && a.kind !== 'MIL') continue; if (a.kind !== 'MIL') { if (seen.has(a.city)) continue; seen.add(a.city) } else if (store.view.rangeNm > 330 && !['EGXE', 'EGQL', 'EGXC', 'EGQS', 'EGXW', 'EGVN', 'EGDL'].includes(a.icao)) continue; const x = P.x(a.lon), y = P.y(a.lat); const af = s.airfields[a.icao]
        ctx.strokeStyle = af && !af.open ? '#f55' : '#4db8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, 7); ctx.stroke(); ctx.fillStyle = '#e8f0ff'; ctx.fillText((a.kind === 'MIL' ? a.name.replace('RAF ', '') : a.city).toUpperCase(), x + 10 * k, y + 4) }
      hits.current = []
      for (const t of Object.values(s.tracks)) { if (t.dropped) continue; const e = s.aircraft[t.entityId]; if (e?.kind === 'asset') continue
        const x = P.x(t.lon), y = P.y(t.lat); const c = colourOf(t)
        if (/^7[567]00$/.test(t.squawk ?? '') && Math.floor(performance.now() / 400) % 2) { ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 16 * k, 0, 7); ctx.stroke() }
        plane(ctx, x, y, t.hdg, 9 * k, c)
        if (store.sel.track === t.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 15 * k, y - 15 * k, 30 * k, 30 * k) }
        if (t.category !== 'CORRELATED' || store.sel.track === t.id || store.view.rangeNm < 300) { ctx.fillStyle = c; ctx.fillText(label(s, t), x + 14 * k, y - 8 * k) }
        hits.current.push({ id: t.id, x, y }) }
      for (const a of Object.values(s.assets)) { if (!a.ac) continue; const x = P.x(a.ac.lon), y = P.y(a.ac.lat); plane(ctx, x, y, a.ac.hdg, 10 * k, '#39ff7a')
        if (store.sel.asset === a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 16 * k, y - 16 * k, 32 * k, 32 * k) }
        ctx.fillStyle = '#39ff7a'; ctx.fillText(`${a.callsign} F${Math.round((a.fuelKg / ASSET_TYPES[a.typeId].fuelCap) * 100)}%`, x + 14 * k, y - 8 * k); hits.current.push({ id: '', asset: a.id, x, y }) }
      for (const op of Object.values(s.ops)) if (op.status === 'ACTIVE' && op.point && op.type === 'PATROL') { ctx.setLineDash([6, 5]); ctx.strokeStyle = '#39ff7a'; ctx.beginPath(); ctx.arc(P.x(op.point.lon), P.y(op.point.lat), (op.radius ?? 18) * P.pxPerNm(op.point.lat), 0, 7); ctx.stroke(); ctx.setLineDash([]) } }
    raf = requestAnimationFrame(frame); return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const rect = () => wrap.current!.getBoundingClientRect()
  const down = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, lat: store.view.lat, lon: store.view.lon, moved: false } }
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) { const r = rect(); const P = makeProj(r.width, r.height, { lat: d.lat, lon: d.lon, rangeNm: store.view.rangeNm }); const c = P.inv(P.cx - dx, P.cy - dy); store.view = { ...store.view, lat: c.lat, lon: c.lon } } }
  const up = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; if (!d || d.moved) return
    const r = rect(), x = e.clientX - r.left, y = e.clientY - r.top, ll = makeProj(r.width, r.height).inv(x, y)
    if (store.pick?.kind === 'point') { const cb = store.pick.cb; store.pick = null; cb(ll); store.notify(); return }
    let best: (typeof hits.current)[0] | null = null, bd = 28 * 28; for (const h of hits.current) { const dd = (h.x - x) ** 2 + (h.y - y) ** 2; if (dd < bd) { bd = dd; best = h } }
    if (best?.asset) { store.sel.asset = best.asset; store.sel.track = undefined; store.notify() } else if (best) { store.sel.asset = undefined; store.select(best.id) } else { store.sel.asset = undefined; store.select(undefined) } }
  const wheel = (e: React.WheelEvent) => { store.view = { ...store.view, rangeNm: Math.max(40, Math.min(1500, store.view.rangeNm * Math.exp(e.deltaY * 0.0012))) }; store.notify() }

  const tr = selT ? st.tracks[selT] : undefined, asset = selA ? st.assets[selA] : undefined
  const counts = { unk: 0, sus: 0, em: 0 }
  for (const t of Object.values(st.tracks)) if (!t.dropped) { if (/^7[567]00$/.test(t.squawk ?? '')) counts.em++; else if (t.category === 'UNKNOWN' || t.category === 'UNCORRELATED') counts.unk++; else if (t.category === 'SUSPICIOUS' || t.category === 'UNRESOLVED') counts.sus++ }
  const left = Math.max(0, 600 - (st.t - st.startT)), sc = computeScores(st)
  const popup = st.incidents.find((i) => i.closed === null && !i.acked && i.kind !== 'RADAR_FAULT' && i.kind !== 'SAR' && !dismissed.includes(i.id))
  const ptr = popup?.entityId ? st.tracks[st.trackByEntity[popup.entityId]] : undefined
  const last = st.messages.filter((m) => m.channel !== 'AIRFIELD' || m.sev !== 'ROUTINE').slice(-1)[0]
  const show = (t?: Track) => { if (t && !t.dropped) { store.sel.asset = undefined; store.select(t.id); store.centreOn(t, 220) } }
  const order = (spec: any) => { const r = store.dispatch({ c: 'op', spec }); store.stepMsg = r ?? ''; store.notify() }
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); store.togglePause() } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  const ready = Object.values(st.assets).filter((a) => a.typeId === 'F3' && a.status === 'READY').length
  return (
    <div className="sg">
      <div className="sg-radar" ref={wrap}><canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} /></div>
      <div className="sg-hud">
        <div className="sg-box"><small>SHIFT TIME LEFT</small><b className="sg-time">{Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}</b></div>
        <div className="sg-box"><small>UNKNOWN</small><b className="y">{counts.unk}</b></div><div className="sg-box"><small>SUSPICIOUS</small><b className="p">{counts.sus}</b></div><div className="sg-box"><small>EMERGENCY</small><b className="o">{counts.em}</b></div>
        <div className="sg-box"><small>GRADE</small><b>{sc.grade}</b></div><div className="sg-box"><small>JETS READY</small><b className="g">{ready}</b></div>
        <div className="sg-ctl"><button onClick={() => store.togglePause()} className={paused ? 'on' : ''}>{paused ? '▶' : 'II'}</button>{[1, 2, 4].map((s) => <button key={s} className={!paused && speed === s ? 'on' : ''} onClick={() => store.setSpeed(s)}>{s}x</button>)}<button onClick={() => { if (confirm('End shift now?')) store.endWatch() }}>END</button><button onClick={() => { if (confirm('Quit to menu?')) { store.stop(); store.engine = null; store.setScreen('MENU') } }}>EXIT</button></div>
      </div>
      <div className="sg-hint">{counts.em ? 'EMERGENCY — an aircraft needs help. Click the orange plane.' : counts.unk + counts.sus ? 'Yellow/purple planes need checking. Click one.' : 'ALL CLEAR — nothing needs your attention.'} · White = safe · Yellow = unknown · Purple = suspicious · Orange = emergency · Green = yours</div>
      <div className="sg-panel sg-contact"><div className="sg-ph">CONTACT DATA</div>
        {!tr && !asset && <div><b>NO AIRCRAFT SELECTED</b><p className="dim">Click an aircraft on the radar. Scroll to zoom, drag to move.</p></div>}
        {tr && <div>
          <h2 style={{ color: colourOf(tr) }}>{label(st, tr)}</h2><div className="dim">TRACK {tr.id} // {word(tr)}</div>
          <div className="kv"><span>TYPE</span><b>{planFor(st, tr)?.typeId ?? '?'}</b></div><div className="kv"><span>ALTITUDE</span><b>{tr.alt === null ? '?' : 'FL' + Math.round(tr.alt / 100)}</b></div><div className="kv"><span>SPEED</span><b>{Math.round(tr.gs)} KT</b></div><div className="kv"><span>HEADING</span><b>{Math.round(tr.hdg)}°</b></div><div className="kv"><span>FLIGHT PLAN</span><b>{planFor(st, tr) ? planFor(st, tr)!.dep + '→' + planFor(st, tr)!.arr : 'NONE'}</b></div>
          {tr.flags.map((f) => <div key={f} className="alert">⚠ {f}</div>)}
          {tr.checks.atc && <div className="ok">ATC: {tr.checks.atc.text}</div>}{tr.checks.registry && <div className={tr.checks.registry.ok ? 'ok' : 'alert'}>REGISTRY: {tr.checks.registry.text}</div>}{tr.vid && <div className="ok">PILOT SAW: {tr.vid.text}</div>}
          <div className="sg-btns">
            <button onClick={() => { store.dispatch({ c: 'atc', trackId: tr.id }); store.dispatch({ c: 'registry', trackId: tr.id }) }}>CHECK IT</button>
            <button className="g" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'IDENTIFIED' })}>MARK SAFE</button>
            <button className="p" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'SUSPICIOUS' })}>FLAG SUSPICIOUS</button>
            <button onClick={() => order({ type: 'IDENTIFY', trackId: tr.id })}>SEND JET TO LOOK</button>
            <button onClick={() => order({ type: 'SHADOW', trackId: tr.id })}>ESCORT / FOLLOW</button>
          </div></div>}
        {asset && <div>
          <h2 className="g">{asset.callsign}</h2><div className="dim">YOUR AIRCRAFT // {ASSET_TYPES[asset.typeId].name}</div>
          <div className="kv"><span>STATUS</span><b>{asset.status}</b></div><div className="kv"><span>TASK</span><b>{asset.opId && st.ops[asset.opId] ? opLabel(st, st.ops[asset.opId]) : 'NONE'}</b></div><div className="kv"><span>FUEL</span><b>{Math.round((asset.fuelKg / ASSET_TYPES[asset.typeId].fuelCap) * 100)}%</b></div><div className="kv"><span>HOME BASE</span><b>{st.airfields[asset.baseId]?.name}</b></div>
          <div className="sg-btns">
            <button onClick={() => { store.pick = { kind: 'point', label: 'PATROL POINT', cb: (p) => order({ type: 'PATROL', assetId: asset.id, point: p, durationMin: 20 }) }; store.notify() }}>PATROL A POINT…</button>
            <button onClick={() => order({ type: 'REFUEL', assetId: asset.id })} disabled={!asset.ac}>REFUEL (TANKER)</button>
            <button onClick={() => order({ type: 'RETURN', assetId: asset.id })} disabled={!asset.ac}>RETURN TO BASE</button>
          </div></div>}
        {store.pick?.kind === 'point' && <div className="amber">▶ Click the map to choose the point</div>}
        {store.stepMsg && <div className="alert">{store.stepMsg}</div>}
      </div>
      <div className="sg-panel sg-radio"><div className="sg-ph">RADIO</div><div className="sg-log">{st.messages.slice(-7).reverse().map((m) => <div key={m.id} className={m.sev}><span className="y">{hms(m.t)}</span> {m.from}: {m.text}</div>)}</div></div>
      <div className="sg-panel sg-sorties"><div className="sg-ph">SORTIES</div>
        {Object.values(st.assets).filter((a) => a.ac || a.status === 'LAUNCHING').map((a) => <div key={a.id} className="sg-row" onClick={() => { store.sel.track = undefined; store.sel.asset = a.id; if (a.ac) store.centreOn(a.ac); store.notify() }}><b className="g">{a.callsign}</b> {ASSET_TYPES[a.typeId].short} // {a.opId && st.ops[a.opId] ? opLabel(st, st.ops[a.opId]) + ' ' + st.ops[a.opId].stages[st.ops[a.opId].stage] : a.status} // FUEL {Math.round((a.fuelKg / ASSET_TYPES[a.typeId].fuelCap) * 100)}%</div>)}
        {!Object.values(st.assets).some((a) => a.ac || a.status === 'LAUNCHING') && <div className="dim">No aircraft airborne. Select a contact and press SEND JET.</div>}</div>
      {last && <div className="sg-bar"><b>{last.from}:</b> {last.text}</div>}
      {popup && <div className={`sg-popup ${popup.kind === 'EMERGENCY_7700' || popup.kind === 'UNLAWFUL_7500' ? 'em' : ''}`}>
        <h3>! {popup.title}</h3><p>{popup.needs}. {popup.kind === 'EMERGENCY_7700' ? 'The aircraft is diverting to the nearest airport — alert it so the runway is cleared.' : popup.kind === 'UNLAWFUL_7500' ? 'Alert the destination airport and send a jet to follow it.' : 'Check it, then decide: safe or suspicious?'}</p>
        <div className="sg-btns">
          {(popup.kind === 'EMERGENCY_7700' || popup.kind === 'UNLAWFUL_7500') && <button onClick={() => { store.dispatch({ c: 'alertAirfield', incidentId: popup.id }); if (popup.kind === 'UNLAWFUL_7500' && ptr) order({ type: 'SHADOW', trackId: ptr.id }) }}>ALERT AIRPORT{popup.kind === 'UNLAWFUL_7500' ? ' + SEND JET' : ''}</button>}
          {popup.kind !== 'EMERGENCY_7700' && popup.kind !== 'UNLAWFUL_7500' && popup.kind !== 'COMMS_7600' && ptr && <button onClick={() => { store.dispatch({ c: 'atc', trackId: ptr.id }); store.dispatch({ c: 'registry', trackId: ptr.id }); show(ptr); setDismissed([...dismissed, popup.id]) }}>CHECK IT</button>}
          <button onClick={() => show(ptr)}>SHOW ME</button>
          <button onClick={() => { store.dispatch({ c: 'ack', incidentId: popup.id }); setDismissed([...dismissed, popup.id]) }}>GOT IT</button></div>
        <small className="dim">{fmtHM(popup.opened)}</small></div>}
    </div>
  )
}

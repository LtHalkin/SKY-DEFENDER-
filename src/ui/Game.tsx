import { useEffect, useRef, useState } from 'react'
import geo from '../sim/data/geography.json'
import { AIRPORTS } from '../sim/data/airports'
import { ZONES } from '../sim/data/fixes'
import { ASSET_TYPES } from '../sim/data/aircraftTypes'
import { distNm, rad } from '../sim/geo'
import { label, planFor } from '../sim/identification'
import { opLabel } from '../sim/operations'
import { escortNear } from '../sim/combat'
import { computeScores } from '../sim/scoring'
import type { Aircraft, GameState, Track } from '../sim/types'
import { store, useStore, SHIFT_SEC, BASE_SPEED } from './store'
import { makeProj } from './proj'
import { audio } from './audio'
import { levelOf, rankOf } from '../game/save'
import { hms } from './common'

const LAND = (geo as any).land as number[][][]
const COAST = (geo as any).coast as number[][][]
const isEm = (t: Track) => !!t.squawk && /^7[567]00$/.test(t.squawk)
export const colourOf = (t: Track) => t.hostile ? '#ff3b3b' : isEm(t) ? '#ff9a2e' : t.complied ? '#7fe3ff' : t.category === 'SUSPICIOUS' || t.category === 'UNRESOLVED' ? '#c77dff' : t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' ? '#ffe34d' : '#f2f2f2'
export const wordOf = (t: Track) => t.hostile ? 'HOSTILE — weapons free' : isEm(t) ? 'EMERGENCY' : t.complied ? 'COMPLYING — leaving' : t.category === 'SUSPICIOUS' ? 'SUSPICIOUS' : t.category === 'UNRESOLVED' ? 'UNSURE — check it' : t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' ? 'UNKNOWN — check it!' : 'SAFE'
const pri = (t: Track) => (t.hostile ? 0 : isEm(t) ? 1 : t.category === 'SUSPICIOUS' || t.category === 'UNRESOLVED' ? 2 : t.category === 'UNKNOWN' || t.category === 'UNCORRELATED' ? 3 : 5)
function plane(ctx: CanvasRenderingContext2D, x: number, y: number, hdg: number, s: number, c: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(hdg)); ctx.fillStyle = c
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.18, -s * 0.2); ctx.lineTo(s * 0.9, s * 0.25); ctx.lineTo(s * 0.9, s * 0.45); ctx.lineTo(s * 0.18, s * 0.2); ctx.lineTo(s * 0.15, s * 0.7); ctx.lineTo(s * 0.45, s * 0.95); ctx.lineTo(s * 0.45, s * 1.1); ctx.lineTo(0, s * 0.95); ctx.lineTo(-s * 0.45, s * 1.1); ctx.lineTo(-s * 0.45, s * 0.95); ctx.lineTo(-s * 0.15, s * 0.7); ctx.lineTo(-s * 0.18, s * 0.2); ctx.lineTo(-s * 0.9, s * 0.45); ctx.lineTo(-s * 0.9, s * 0.25); ctx.lineTo(-s * 0.18, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.restore()
}
const liveTracks = (st: GameState) => Object.values(st.tracks).filter((t) => !t.dropped && st.aircraft[t.entityId]?.kind !== 'asset')
const samsInRange = (st: GameState, ent: Aircraft) => st.batteries.filter((b) => distNm(b, ent) <= b.range)

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = store.st; if (!s) return
  ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, w, h)
  const P = makeProj(w, h); const k = Math.max(1, h / 950)
  ctx.font = `${12 * k}px "Lucida Console",monospace`
  // land + coast
  ctx.fillStyle = '#0b1612'; ctx.beginPath()
  for (const poly of LAND) poly.forEach((p, i) => (i ? ctx.lineTo(P.x(p[0]), P.y(p[1])) : ctx.moveTo(P.x(p[0]), P.y(p[1]))))
  ctx.fill()
  ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 1.5; ctx.beginPath()
  for (const line of COAST) line.forEach((p, i) => (i ? ctx.lineTo(P.x(p[0]), P.y(p[1])) : ctx.moveTo(P.x(p[0]), P.y(p[1]))))
  ctx.stroke()
  // radar sweeps (operational ground stations)
  if (store.save.settings.sweep) for (const r of s.radars) {
    if (r.airborne || r.status === 'OFFLINE' || r.status === 'MAINTENANCE') continue
    const x = P.x(r.lon), y = P.y(r.lat), R = r.primaryRange * P.pxPerNm(r.lat) * (r.status === 'DEGRADED' ? 0.55 : 1)
    const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(60,255,120,0.10)'); g.addColorStop(1, 'rgba(60,255,120,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, rad(r.angle - 90 - 18), rad(r.angle - 90)); ctx.closePath(); ctx.fill()
  }
  for (const z of ZONES) { const x = P.x(z.lon), y = P.y(z.lat), r = z.r * P.pxPerNm(z.lat); ctx.fillStyle = 'rgba(170,20,20,0.28)'; ctx.strokeStyle = '#c33'; ctx.lineWidth = 1; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2) }
  const seen = new Set<string>()
  for (const a of AIRPORTS) {
    if (a.country !== 'GB' && a.country !== 'IE') continue
    const own = !!s.airfields[a.icao] && Object.values(s.assets).some((x) => x.baseId === a.icao)
    if (a.kind !== 'MIL' && (a.size < 3 || seen.has(a.city))) continue
    if (a.kind === 'MIL' && !own) continue
    if (a.kind !== 'MIL') seen.add(a.city)
    const x = P.x(a.lon), y = P.y(a.lat)
    ctx.strokeStyle = a.kind === 'MIL' ? '#39ff7a' : '#4db8ff'; ctx.lineWidth = 2; ctx.beginPath()
    if (a.kind === 'MIL') ctx.rect(x - 6 * k, y - 6 * k, 12 * k, 12 * k); else ctx.arc(x, y, 6 * k, 0, 7)
    ctx.stroke(); ctx.fillStyle = a.kind === 'MIL' ? '#8dffb0' : '#cfe3ff'; ctx.fillText((a.kind === 'MIL' ? a.name.replace('RAF ', '') + ' AB' : a.city).toUpperCase(), x + 10 * k, y + 4)
  }
  // SAM batteries
  // SAM batteries: one marker per site; rings only when relevant (or as set in settings)
  const ringMode = store.save.settings.samRings ?? 'AUTO'
  const hostiles = Object.values(s.tracks).filter((t) => !t.dropped && t.hostile)
  const sites = new Map<string, typeof s.batteries>()
  for (const b of s.batteries) sites.set(b.site, [...(sites.get(b.site) ?? []), b])
  for (const group of sites.values()) {
    const b0 = group[0], x = P.x(b0.lon), y = P.y(b0.lat)
    const R = Math.max(...group.map((b) => b.range)) * P.pxPerNm(b0.lat)
    const sel = group.some((b) => b.id === store.sel.battery)
    const ammo = group.reduce((n, b) => n + b.missiles, 0), max = group.reduce((n, b) => n + b.maxMissiles, 0), auto = group.some((b) => b.auto)
    const threat = hostiles.some((t) => distNm(t, b0) < Math.max(...group.map((b) => b.range)) + 40)
    if (ringMode === 'ALL' || sel || (ringMode === 'AUTO' && threat)) {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = ammo > 0 ? (auto ? 'rgba(255,80,80,0.7)' : 'rgba(80,200,255,0.55)') : 'rgba(120,120,120,0.5)'; ctx.lineWidth = sel ? 2 : 1
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.fillStyle = ammo > 0 ? (auto ? '#ff6b6b' : '#4db8ff') : '#777'; ctx.beginPath(); ctx.moveTo(x, y - 7 * k); ctx.lineTo(x + 6 * k, y + 5 * k); ctx.lineTo(x - 6 * k, y + 5 * k); ctx.closePath(); ctx.fill()
    if (sel || threat || store.view.rangeNm < 220) ctx.fillText(`SAM${group.length > 1 ? '×' + group.length : ''} ${ammo}/${max}`, x + 9 * k, y + 14 * k)
    hits.push({ id: '', battery: (group.find((b) => b.id === store.sel.battery) ?? b0).id, x, y })
  }
  // patrols
  for (const op of Object.values(s.ops)) if (op.status === 'ACTIVE' && op.point && op.type === 'PATROL') { ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(57,255,122,0.6)'; ctx.beginPath(); ctx.arc(P.x(op.point.lon), P.y(op.point.lat), (op.radius ?? 18) * P.pxPerNm(op.point.lat), 0, 7); ctx.stroke(); ctx.setLineDash([]) }
  // tracks
  const flash = Math.floor(performance.now() / 400) % 2
  for (const t of liveTracks(s)) {
    const e = s.aircraft[t.entityId]
    const x = P.x(t.lon), y = P.y(t.lat); const c = colourOf(t)
    if (pri(t) < 5 && t.gs > 40) { const L = (t.gs / 60) * 3 * P.pxPerNm(t.lat); ctx.strokeStyle = c; ctx.globalAlpha = 0.45; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(rad(t.hdg)) * L, y - Math.cos(rad(t.hdg)) * L); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1 }
    if (t.hostile && e?.raid && !e.raid.breached) { const tx = P.x(e.raid.lon), ty = P.y(e.raid.lat); ctx.strokeStyle = 'rgba(255,59,59,0.5)'; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 14 * k, 0, 7); ctx.stroke() }
    if ((isEm(t) || t.hostile) && flash) { ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 16 * k, 0, 7); ctx.stroke() }
    plane(ctx, x, y, t.hdg, 9 * k, c)
    if (store.sel.track === t.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 15 * k, y - 15 * k, 30 * k, 30 * k) }
    if (pri(t) < 5 || store.sel.track === t.id || store.view.rangeNm < 250) { ctx.fillStyle = c; ctx.fillText(t.hostile ? 'BANDIT' : label(s, t), x + 14 * k, y - 8 * k); if (store.view.rangeNm < 250 || store.sel.track === t.id) ctx.fillText(`${t.alt === null ? '---' : Math.round(t.alt / 100)} ${Math.round(t.gs)}`, x + 14 * k, y + 6 * k) }
    hits.push({ id: t.id, x, y })
  }
  // own aircraft (data link)
  for (const a of Object.values(s.assets)) {
    if (!a.ac) continue
    const x = P.x(a.ac.lon), y = P.y(a.ac.lat)
    plane(ctx, x, y, a.ac.hdg, 10 * k, '#39ff7a')
    if (store.sel.asset === a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 16 * k, y - 16 * k, 32 * k, 32 * k) }
    const op = a.opId ? s.ops[a.opId] : undefined
    const tg = op?.entityId ? s.aircraft[op.entityId] : undefined
    if (tg) { ctx.strokeStyle = 'rgba(57,255,122,0.55)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(P.x(tg.lon), P.y(tg.lat)); ctx.stroke(); ctx.setLineDash([]) }
    const t = ASSET_TYPES[a.typeId]
    ctx.fillStyle = a.lowWarned && flash ? '#ffb000' : '#39ff7a'
    ctx.fillText(a.callsign, x + 14 * k, y - 8 * k)
    ctx.fillText(`F${Math.round((a.fuelKg / t.fuelCap) * 100)}%${t.missiles ? ' M' + a.missiles : ''}`, x + 14 * k, y + 6 * k)
    hits.push({ id: '', asset: a.id, x, y })
  }
  // missiles
  for (const m of s.missiles) {
    ctx.strokeStyle = 'rgba(255,240,120,0.8)'; ctx.lineWidth = 2; ctx.beginPath()
    m.trail.forEach((p, i) => (i ? ctx.lineTo(P.x(p.lon), P.y(p.lat)) : ctx.moveTo(P.x(p.lon), P.y(p.lat)))); ctx.lineTo(P.x(m.lon), P.y(m.lat)); ctx.stroke()
    ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(P.x(m.lon), P.y(m.lat), 3 * k, 0, 7); ctx.fill()
  }
  // effects
  const now = performance.now()
  for (const f of store.fx) {
    const a = (now - f.t0) / 1000, x = P.x(f.lon), y = P.y(f.lat)
    ctx.globalAlpha = Math.max(0, 1 - a / 3)
    if (f.kind === 'splash') { for (let i = 0; i < 3; i++) { ctx.strokeStyle = i ? '#ff9a2e' : '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, (10 + a * 40 + i * 10) * k, 0, 7); ctx.stroke() } ctx.fillStyle = '#ffde59'; ctx.font = `bold ${18 * k}px monospace`; ctx.fillText('SPLASH', x + 20 * k, y - 20 * k) }
    else if (f.kind === 'launch') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, (6 + a * 10) * k, 0, 7); ctx.fill() }
    else if (f.kind === 'miss') { ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.arc(x, y, (8 + a * 20) * k, 0, 7); ctx.stroke(); ctx.fillStyle = '#ccc'; ctx.font = `bold ${14 * k}px monospace`; ctx.fillText('MISS', x + 14 * k, y - 14 * k) }
    else if (f.kind === 'breach') { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, (20 + a * 60) * k, 0, 7); ctx.stroke(); ctx.fillStyle = '#ff6b6b'; ctx.font = `bold ${18 * k}px monospace`; ctx.fillText(`BREACH: ${f.text}`, x + 20 * k, y) }
    else if (f.kind === 'coins' && f.n) { ctx.fillStyle = f.n > 0 ? '#ffde59' : '#ff6b6b'; ctx.font = `bold ${15 * k}px monospace`; ctx.fillText(`${f.n > 0 ? '+' : ''}${f.n}`, x + 18 * k, y - 26 * k - a * 25 * k) }
    ctx.globalAlpha = 1; ctx.font = `${12 * k}px "Lucida Console",monospace`
  }
}
let hits: { id: string; asset?: string; battery?: string; x: number; y: number }[] = []

export function Game() {
  const st = useStore((s) => s.st)!
  const ref = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; moved: boolean } | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [tab, setTab] = useState<'RADIO' | 'CONTACTS' | 'DEFENCES'>('RADIO')
  const [jet, setJet] = useState('')
  const [voice, setVoice] = useState(false)
  const speed = useStore((s) => s.speed), paused = useStore((s) => s.paused)
  const { track: selT, asset: selA, battery: selB } = useStore((s) => s.sel)

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; let raf = 0, w = 0, h = 0, dpr = 1
    const resize = () => { const r = wrap.current!.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px' }
    resize(); const ro = new ResizeObserver(resize); ro.observe(wrap.current!)
    const frame = () => { raf = requestAnimationFrame(frame); hits = []; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); try { draw(ctx, w, h) } catch (e) { console.error(e) } }
    raf = requestAnimationFrame(frame); return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])
  const rect = () => wrap.current!.getBoundingClientRect()
  const down = (e: React.PointerEvent) => { if (e.button !== 0) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, lat: store.view.lat, lon: store.view.lon, moved: false } }
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) { const r = rect(); const P = makeProj(r.width, r.height, { lat: d.lat, lon: d.lon, rangeNm: store.view.rangeNm }); const c = P.inv(P.cx - dx, P.cy - dy); store.view = { ...store.view, lat: Math.max(44, Math.min(66, c.lat)), lon: Math.max(-30, Math.min(15, c.lon)) } } }
  const up = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; if (!d || d.moved) return
    const r = rect(), x = e.clientX - r.left, y = e.clientY - r.top, ll = makeProj(r.width, r.height).inv(x, y)
    if (store.pick) { const cb = store.pick.cb; store.pick = null; cb(ll); store.notify(); return }
    let best: (typeof hits)[0] | null = null, bd = 26 * 26
    for (const h of hits) { const dd = (h.x - x) ** 2 + (h.y - y) ** 2; if (dd < bd) { bd = dd; best = h } }
    audio.ui()
    if (best?.asset) store.sel = { asset: best.asset }; else if (best?.battery) store.sel = { battery: best.battery }; else if (best) store.sel = { track: best.id }; else store.sel = {}
    store.stepMsg = ''; store.notify() }
  const wheel = (e: React.WheelEvent) => { store.view = { ...store.view, rangeNm: Math.max(40, Math.min(1200, store.view.rangeNm * Math.exp(e.deltaY * 0.0012))) }; store.notify() }

  const tr = selT ? st.tracks[selT] : undefined, asset = selA ? st.assets[selA] : undefined, bat = selB ? st.batteries.find((b) => b.id === selB) : undefined
  const ent = tr ? st.aircraft[tr.entityId] : undefined
  const tracks = liveTracks(st)
  const n = { unk: tracks.filter((t) => pri(t) === 3).length, sus: tracks.filter((t) => pri(t) === 2).length, hos: tracks.filter((t) => t.hostile).length, em: tracks.filter((t) => pri(t) === 1).length }
  const left = Math.max(0, SHIFT_SEC - (st.t - st.startT)) / BASE_SPEED
  const sc = computeScores(st)
  const lv = levelOf(store.save.xp)
  const say = (r: string | null) => { store.stepMsg = r ?? ''; if (!r) audio.ui(); store.notify() }
  const order = (spec: any) => say(store.dispatch({ c: 'op', spec: { ...spec, assetId: spec.assetId ?? (jet || undefined) } }))
  const show = (t?: Track) => { if (t && !t.dropped) { store.sel = { track: t.id }; store.centreOn(t, Math.min(store.view.rangeNm, 250)) } }
  const fighters = Object.values(st.assets).filter((a) => ASSET_TYPES[a.typeId].role === 'FIGHTER')
  const avail = fighters.filter((a) => a.status === 'READY' || (a.ac && !a.opId))

  // popups: combat popups first, then incident popups
  const cp = store.popups.find((p) => !dismissed.includes(p.id) && (p.kind !== 'complied' || performance.now() - p.t0 < 6000))
  const ctr = cp && cp.kind !== 'lowfuel' ? st.tracks[cp.trackId] : undefined
  const cent = ctr ? st.aircraft[ctr.entityId] : undefined
  const ipop = !cp ? st.incidents.find((i) => i.closed === null && !i.acked && i.kind !== 'RADAR_FAULT' && i.kind !== 'SAR' && !dismissed.includes(i.id)) : undefined
  const ptr = ipop?.entityId ? st.tracks[st.trackByEntity[ipop.entityId]] : undefined
  const dismiss = (id: string) => setDismissed((d) => [...d, id])
  const last = [...st.messages].reverse().find((m) => m.sev !== 'ROUTINE') ?? st.messages[st.messages.length - 1]

  // context hint
  let hint = 'All quiet. Scan for yellow planes, keep jets ready, and watch the coast.'
  if (n.hos) hint = 'RED = HOSTILE. Select it and press ENGAGE, or FIRE SAM when it is inside a battery ring.'
  else if (n.em) hint = 'ORANGE = EMERGENCY. Open the popup and alert the airport.'
  else if (tr && pri(tr) === 3 && !tr.checks.atc) hint = 'Press CHECK IT — ATC and the registry will tell you who this is.'
  else if (tr && pri(tr) === 3 && tr.checks.atc) hint = tr.checks.atc.found ? 'ATC knows this flight. Press MARK SAFE.' : 'ATC has no idea who this is. SEND JET TO LOOK, then WARN it if it misbehaves.'
  else if (n.unk) hint = 'Yellow planes are UNKNOWN. Click one to find out who it is.'

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const t = store.sel.track
      if (e.code === 'Space') { e.preventDefault(); store.togglePause() }
      else if (e.key === '1') store.setSpeed(1); else if (e.key === '2') store.setSpeed(2); else if (e.key === '3') store.setSpeed(4)
      else if (e.key === 'Escape') { store.pick = null; store.sel = {}; store.notify() }
      else if (t && e.key === 'c') { store.dispatch({ c: 'atc', trackId: t }); store.dispatch({ c: 'registry', trackId: t }) }
      else if (t && e.key === 's') store.dispatch({ c: 'declare', trackId: t, cat: 'IDENTIFIED' })
      else if (t && e.key === 'i') say(store.dispatch({ c: 'op', spec: { type: 'IDENTIFY', trackId: t } }))
      else if (t && e.key === 'w') say(store.dispatch({ c: 'warn', trackId: t }))
      else if (t && e.key === 'x') say(store.dispatch({ c: 'op', spec: { type: 'ENGAGE', trackId: t } }))
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])

  return (
    <div className="sg">
      <div className="sg-radar" ref={wrap} onContextMenu={(e) => e.preventDefault()}><canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} style={{ cursor: store.pick ? 'crosshair' : 'default' }} /></div>
      <div className="sg-hud">
        <div className="sg-box rank"><small>{rankOf(lv.level).toUpperCase()} · LV {lv.level}</small><b className="coin">{st.coins >= 0 ? '+' : ''}{st.coins} ◆</b></div>
        <div className="sg-box"><small>SHIFT TIME LEFT</small><b className="sg-time">{Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}</b></div>
        <div className="sg-box"><small>UNKNOWN</small><b className="y">{n.unk}</b></div><div className="sg-box"><small>SUSPICIOUS</small><b className="p">{n.sus}</b></div>
        <div className={`sg-box ${n.hos ? 'pulse' : ''}`}><small>HOSTILE</small><b className="r">{n.hos}</b></div><div className={`sg-box ${n.em ? 'pulse' : ''}`}><small>EMERGENCY</small><b className="o">{n.em}</b></div>
        <div className="sg-box"><small>AIRSPACE HELD</small><b className={st.airspace > 60 ? 'g' : st.airspace > 30 ? 'o' : 'r'}>{st.airspace}%</b><i className="air" style={{ width: st.airspace + '%' }} /></div>
        <div className="sg-box"><small>SPLASHES / GRADE</small><b>{st.splashes} · {sc.grade}</b></div>
        <div className="sg-ctl"><button onClick={() => store.togglePause()} className={paused ? 'on' : ''} title="Space">{paused ? '▶' : 'II'}</button>{[1, 2, 4].map((m) => <button key={m} className={!paused && speed === BASE_SPEED * m ? 'on' : ''} onClick={() => store.setSpeed(m)}>{m}x</button>)}
          <button title="Missile battery range rings" onClick={() => { const m = store.save.settings.samRings ?? 'AUTO'; store.save.settings.samRings = m === 'AUTO' ? 'ALL' : m === 'ALL' ? 'OFF' : 'AUTO'; store.persist(); store.notify() }}>RINGS: {store.save.settings.samRings ?? 'AUTO'}</button>
          <button onClick={() => setVoice(true)}>VOICE</button><button onClick={() => { if (confirm('End the shift now? You keep what you have earned.')) store.endWatch() }}>END</button></div>
      </div>
      <div className="sg-hint">TIP: {hint}{store.pick ? '   ▶ CLICK THE MAP TO CHOOSE A POINT' : ''}</div>

      <div className="sg-panel sg-contact"><div className="sg-ph">CONTACT DATA</div>
        {!tr && !asset && !bat && <div><b>NO AIRCRAFT SELECTED</b><p className="dim">Click any plane on the radar. Scroll to zoom, drag to move.</p>
          <div className="legend"><p><i style={{ background: '#f2f2f2' }} />SAFE — normal flight</p><p><i style={{ background: '#ffe34d' }} />UNKNOWN — check it!</p><p><i style={{ background: '#c77dff' }} />SUSPICIOUS</p><p><i style={{ background: '#ff3b3b' }} />HOSTILE — weapons free</p><p><i style={{ background: '#ff9a2e' }} />EMERGENCY</p><p><i style={{ background: '#39ff7a' }} />YOUR AIRCRAFT</p><p><i style={{ background: '#4db8ff' }} />YOUR MISSILE BATTERIES</p></div>
          <p className="dim">Keys: C check · S safe · I send jet · W warn · X engage · Space pause · 1-3 speed</p></div>}
        {tr && tr.dropped && <div><h2 className="dim">CONTACT LOST</h2><p className="dim">{tr.log.some((l) => l.includes('Destroyed')) ? 'Target destroyed.' : 'This aircraft has landed, left the area or dropped off radar.'}</p></div>}
        {tr && !tr.dropped && <div>
          <h2 style={{ color: colourOf(tr) }}>{tr.hostile ? 'BANDIT' : label(st, tr)}</h2><div className="dim">TRACK {tr.id} // <b style={{ color: colourOf(tr) }}>{wordOf(tr)}</b></div>
          <div className="kv"><span>TYPE</span><b>{tr.vid ? ent?.typeName : planFor(st, tr)?.typeId ?? '?'}</b></div><div className="kv"><span>ALTITUDE</span><b>{tr.alt === null ? '?' : 'FL' + Math.round(tr.alt / 100)}</b></div><div className="kv"><span>SPEED / HEADING</span><b>{Math.round(tr.gs)} KT / {Math.round(tr.hdg)}°</b></div><div className="kv"><span>FLIGHT PLAN</span><b>{planFor(st, tr) ? planFor(st, tr)!.dep + '→' + planFor(st, tr)!.arr : 'NONE'}</b></div>
          {tr.hostile && ent?.raid && !ent.raid.breached && <div className="alert">⚠ HEADING FOR {ent.raid.name.toUpperCase()} — {Math.round(distNm(ent, ent.raid))} NM</div>}
          {tr.flags.map((f) => <div key={f} className="alert">⚠ {f}</div>)}
          {tr.checks.atc && <div className={tr.checks.atc.found ? 'ok' : 'amber'}>ATC: {tr.checks.atc.text}</div>}{tr.checks.registry && <div className={tr.checks.registry.ok ? 'ok' : 'alert'}>REGISTRY: {tr.checks.registry.text}</div>}{tr.vid && <div className="ok">PILOT SAW: {tr.vid.text}</div>}
          <div className="sg-sub">JET <select value={jet} onChange={(e) => setJet(e.target.value)}><option value="">AUTO (best available)</option>{avail.map((a) => <option key={a.id} value={a.id}>{a.callsign} · {ASSET_TYPES[a.typeId].short} · {a.ac ? 'AIRBORNE' : 'READY'} · M{a.missiles}</option>)}</select></div>
          <div className="sg-btns">
            {!tr.hostile && <><button onClick={() => { store.dispatch({ c: 'atc', trackId: tr.id }); store.dispatch({ c: 'registry', trackId: tr.id }); audio.ui() }}>CHECK IT</button>
              <button className="g" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'IDENTIFIED' })}>MARK SAFE</button>
              <button className="p" onClick={() => store.dispatch({ c: 'declare', trackId: tr.id, cat: 'SUSPICIOUS' })}>FLAG SUSPICIOUS</button></>}
            <button onClick={() => order({ type: 'IDENTIFY', trackId: tr.id })}>SEND JET TO LOOK</button>
            <button onClick={() => order({ type: 'SHADOW', trackId: tr.id })}>ESCORT / FOLLOW</button>
            <button className="o" disabled={!ent || !escortNear(st, ent)} title="Needs one of your jets alongside" onClick={() => say(store.dispatch({ c: 'warn', trackId: tr.id }))}>WARN / ORDER AWAY</button>
            <button className="r" disabled={!tr.hostile} onClick={() => order({ type: 'ENGAGE', trackId: tr.id })}>ENGAGE WITH JET</button>
            {ent && samsInRange(st, ent).map((b) => <button key={b.id} className="r" disabled={!tr.hostile || b.missiles <= 0} onClick={() => say(store.dispatch({ c: 'samFire', batteryId: b.id, trackId: tr.id }))}>FIRE {b.name} ({b.missiles})</button>)}
          </div>
          {!tr.hostile && <p className="dim small">Weapons are tight: you can only fire at aircraft confirmed hostile — by a jet's visual ID, or after they refuse a warning.</p>}
        </div>}
        {asset && (() => { const t = ASSET_TYPES[asset.typeId]; const op = asset.opId ? st.ops[asset.opId] : undefined; return <div>
          <h2 className="g">{asset.callsign}</h2><div className="dim">YOUR AIRCRAFT // {t.name}</div>
          <div className="kv"><span>STATUS</span><b>{asset.status}{asset.status === 'LAUNCHING' && asset.launchAt ? ` (${Math.ceil((asset.launchAt - st.t) / BASE_SPEED)}s)` : ''}</b></div><div className="kv"><span>TASK</span><b>{op ? `${opLabel(st, op)} · ${op.stages[op.stage]}` : 'NONE'}</b></div>
          <div className="kv"><span>FUEL</span><b>{Math.round((asset.fuelKg / t.fuelCap) * 100)}%</b></div>{t.missiles > 0 && <div className="kv"><span>MISSILES</span><b>{asset.missiles} / {asset.maxMissiles} (range {t.mRange} NM)</b></div>}
          <div className="kv"><span>SPEED</span><b>{asset.ac ? `${Math.round(asset.ac.gs)} KT FL${Math.round(asset.ac.alt / 100)}` : `max ${t.maxKt} KT`}</b></div><div className="kv"><span>HOME BASE</span><b>{st.airfields[asset.baseId]?.name}</b></div>
          {t.role === 'FIGHTER' && <><div className="sg-sub">SPEED</div><div className="sg-speed">{(['MAX', 'CRUISE', 'ECO'] as const).map((m) => <button key={m} className={(asset.speedMode ?? 'CRUISE') === m ? 'on' : ''} onClick={() => store.dispatch({ c: 'speedMode', assetId: asset.id, mode: m })}><b>{m === 'MAX' ? 'MAX (BUSTER)' : m}</b><small>{m === 'MAX' ? `${Math.round(t.maxKt * 0.95)} KT · burns fast` : m === 'ECO' ? `${Math.round(t.cruiseKt * 0.78)} KT · saves fuel` : `${t.cruiseKt} KT · normal`}</small></button>)}</div></>}
          <div className="sg-btns">
            <button onClick={() => { store.pick = { kind: 'point', label: 'PATROL', cb: (p) => order({ type: 'PATROL', assetId: asset.id, point: p, durationMin: 40 }) }; store.notify() }}>PATROL A POINT…</button>
            <button disabled={!asset.ac} onClick={() => order({ type: 'PATROL', assetId: asset.id, point: { lat: asset.ac!.lat, lon: asset.ac!.lon }, radius: 8, durationMin: 30 })}>HOLD HERE</button>
            <button disabled={!asset.ac || t.role !== 'FIGHTER'} onClick={() => order({ type: 'REFUEL', assetId: asset.id })}>REFUEL (TANKER)</button>
            <button disabled={!asset.ac} onClick={() => order({ type: 'RETURN', assetId: asset.id })}>RETURN TO BASE</button>
          </div></div> })()}
        {bat && st.batteries.filter((b) => b.site === bat.site).length > 1 && <div className="sg-sub">SITE <select value={bat.id} onChange={(e) => { store.sel = { battery: e.target.value }; store.notify() }}>{st.batteries.filter((b) => b.site === bat.site).map((b) => <option key={b.id} value={b.id}>{b.name} {b.missiles}/{b.maxMissiles}</option>)}</select></div>}
        {bat && <div>
          <h2 style={{ color: '#4db8ff' }}>{bat.name}</h2><div className="dim">YOUR MISSILE BATTERY</div>
          <div className="kv"><span>MISSILES</span><b>{bat.missiles} / {bat.maxMissiles}</b></div><div className="kv"><span>RANGE</span><b>{bat.range} NM</b></div><div className="kv"><span>STATUS</span><b>{bat.missiles <= 0 ? 'EMPTY' : st.t < bat.readyAt ? `RELOADING ${Math.ceil((bat.readyAt - st.t) / BASE_SPEED)}s` : 'READY'}</b></div>
          <div className="sg-btns"><button className={bat.auto ? 'r' : ''} onClick={() => store.dispatch({ c: 'samAuto', batteryId: bat.id, on: !bat.auto })}>{bat.auto ? 'AUTO-FIRE: ON' : 'AUTO-FIRE: OFF'}</button><button onClick={() => store.centreOn(bat, 120)}>ZOOM TO</button></div>
          <p className="dim small">With auto-fire on, the battery engages any HOSTILE aircraft entering its ring. It never fires at unconfirmed or civil aircraft.</p></div>}
        {store.stepMsg && <div className="alert">✗ {store.stepMsg}</div>}
      </div>

      <div className="sg-panel sg-radio">
        <div className="sg-tabs">{(['RADIO', 'CONTACTS', 'DEFENCES'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'CONTACTS' && n.unk + n.sus + n.hos + n.em ? ` (${n.unk + n.sus + n.hos + n.em})` : ''}</button>)}</div>
        {tab === 'RADIO' && <div className="sg-log">{st.messages.slice(-14).reverse().map((m) => <div key={m.id} className={m.sev}><span className="y">{hms(m.t)}</span> <b>{m.from}</b>: {m.text}</div>)}</div>}
        {tab === 'CONTACTS' && <div className="sg-log">{[...tracks].sort((a, b) => pri(a) - pri(b)).slice(0, 40).map((t) => <div key={t.id} className="sg-row" onClick={() => show(t)}><b style={{ color: colourOf(t) }}>{t.hostile ? 'BANDIT' : label(st, t)}</b> · {wordOf(t)} · FL{t.alt === null ? '?' : Math.round(t.alt / 100)} · {Math.round(t.gs)}KT</div>)}</div>}
        {tab === 'DEFENCES' && <div className="sg-log">
          {st.batteries.map((b) => <div key={b.id} className="sg-row" onClick={() => { store.sel = { battery: b.id }; store.notify() }}><b style={{ color: '#4db8ff' }}>{b.name}</b> · {b.missiles}/{b.maxMissiles} · {b.range}NM {b.auto ? '· AUTO' : ''} <button className="mini" onClick={(e) => { e.stopPropagation(); store.dispatch({ c: 'samAuto', batteryId: b.id, on: !b.auto }) }}>{b.auto ? 'AUTO ON' : 'AUTO OFF'}</button></div>)}
          {!st.batteries.length && <div className="dim">No missile batteries. Buy some in the shop.</div>}
          {fighters.map((a) => <div key={a.id} className="sg-row" onClick={() => { store.sel = { asset: a.id }; if (a.ac) store.centreOn(a.ac); store.notify() }}><b className="g">{a.callsign}</b> · {ASSET_TYPES[a.typeId].short} · {a.status} · M{a.missiles}</div>)}
        </div>}
      </div>
      <div className="sg-panel sg-sorties"><div className="sg-ph">SORTIES</div>
        {Object.values(st.assets).filter((a) => a.ac || a.status === 'LAUNCHING').map((a) => { const t = ASSET_TYPES[a.typeId]; const op = a.opId ? st.ops[a.opId] : undefined; return <div key={a.id} className="sg-row" onClick={() => { store.sel = { asset: a.id }; if (a.ac) store.centreOn(a.ac); store.notify() }}><b className="g">{a.callsign}</b> {t.short} // {op ? `${opLabel(st, op)} · ${op.stages[op.stage]}` : a.status} // <span className={a.fuelKg / t.fuelCap < 0.25 ? 'r' : a.fuelKg / t.fuelCap < 0.35 ? 'o' : ''}>F{Math.round((a.fuelKg / t.fuelCap) * 100)}%</span>{t.missiles ? ` M${a.missiles}` : ''}{t.role === 'FIGHTER' ? ` · ${a.speedMode ?? 'CRUISE'}` : ''}</div> })}
        {!Object.values(st.assets).some((a) => a.ac || a.status === 'LAUNCHING') && <div className="dim">Nothing airborne. {fighters.filter((a) => a.status === 'READY').length} jets ready.</div>}</div>
      {last && <div className="sg-bar"><b>{last.from}:</b> {last.text}</div>}

      {cp && cp.kind === 'lowfuel' && st.assets[cp.trackId] && (() => { const a = st.assets[cp.trackId]; const t = ASSET_TYPES[a.typeId]; const tankers = Object.values(st.assets).filter((x) => ASSET_TYPES[x.typeId].role === 'TANKER' && x.ac); return <div className="sg-popup em">
        <h3>⛽ {a.callsign} LOW FUEL — {Math.round((a.fuelKg / t.fuelCap) * 100)}%</h3>
        <p>{a.callsign} is running low{a.opId && st.ops[a.opId] ? ` while on ${opLabel(st, st.ops[a.opId])}` : ''}. {tankers.length ? 'A tanker is airborne and can top it up so it stays on task.' : 'No tanker is airborne — buy one in the shop to refuel in the air.'}</p>
        <div className="sg-btns">{tankers.length > 0 && <button className="g" onClick={() => { say(store.dispatch({ c: 'op', spec: { type: 'REFUEL', assetId: a.id } })); dismiss(cp.id) }}>SEND TANKER</button>}
          <button onClick={() => { store.dispatch({ c: 'speedMode', assetId: a.id, mode: 'ECO' }); dismiss(cp.id) }}>SWITCH TO ECO</button>
          <button onClick={() => { say(store.dispatch({ c: 'op', spec: { type: 'RETURN', assetId: a.id } })); dismiss(cp.id) }}>RETURN TO BASE</button>
          <button onClick={() => { store.sel = { asset: a.id }; if (a.ac) store.centreOn(a.ac); dismiss(cp.id) }}>SHOW ME</button></div></div> })()}
      {cp && cp.kind !== 'lowfuel' && ctr && <div className={`sg-popup ${cp.kind === 'complied' ? 'ok' : 'hot'}`}>
        <h3>{cp.kind === 'hostile' ? '! HOSTILE CONFIRMED' : cp.kind === 'refused' ? '! TARGET REFUSES TO COMPLY' : '✓ INTRUDER COMPLYING'}</h3>
        <p>{cp.kind === 'complied' ? `${label(st, ctr)} is turning away. Well done — no shots needed.` : `${cent?.typeName ?? 'The aircraft'}${cent?.raid ? ` is heading for ${cent.raid.name}` : ''}. Weapons are free on your authority.`}</p>
        <div className="sg-btns">{cp.kind !== 'complied' && cent && <>
          <button className="r" onClick={() => { order({ type: 'ENGAGE', trackId: ctr.id }); dismiss(cp.id) }}>ENGAGE WITH JET</button>
          {samsInRange(st, cent).filter((b) => b.missiles > 0).slice(0, 2).map((b) => <button key={b.id} className="r" onClick={() => { say(store.dispatch({ c: 'samFire', batteryId: b.id, trackId: ctr.id })); dismiss(cp.id) }}>FIRE {b.name}</button>)}</>}
          <button onClick={() => { show(ctr); dismiss(cp.id) }}>SHOW ME</button><button onClick={() => dismiss(cp.id)}>{cp.kind === 'complied' ? 'OK' : 'KEEP ESCORTING'}</button></div></div>}
      {ipop && <div className={`sg-popup ${ipop.kind === 'HOSTILE' ? 'hot' : ipop.kind === 'EMERGENCY_7700' || ipop.kind === 'UNLAWFUL_7500' ? 'em' : ''}`}>
        <h3>! {ipop.title}</h3>
        <p>{ipop.kind === 'HOSTILE' ? 'Something fast with no transponder is inbound. Send a jet to identify it before it reaches its target.' : ipop.kind === 'EMERGENCY_7700' ? 'The aircraft is diverting to the nearest airport — alert it so the runway is cleared.' : ipop.kind === 'UNLAWFUL_7500' ? 'Alert the destination airport and send a jet to follow it.' : ipop.kind === 'COMMS_7600' ? 'Radio failure. It will continue to its destination — just keep an eye on it.' : `${ipop.needs.replace(/[?.]+$/, '')}. Check it, then decide: safe or suspicious?`}</p>
        <div className="sg-btns">
          {ipop.kind === 'HOSTILE' && ptr && <button className="r" onClick={() => { order({ type: 'IDENTIFY', trackId: ptr.id }); store.dispatch({ c: 'ack', incidentId: ipop.id }); show(ptr) }}>SCRAMBLE JET</button>}
          {(ipop.kind === 'EMERGENCY_7700' || ipop.kind === 'UNLAWFUL_7500') && <button className="o" onClick={() => { store.dispatch({ c: 'alertAirfield', incidentId: ipop.id }); if (ipop.kind === 'UNLAWFUL_7500' && ptr) order({ type: 'SHADOW', trackId: ptr.id }) }}>ALERT AIRPORT{ipop.kind === 'UNLAWFUL_7500' ? ' + SEND JET' : ''}</button>}
          {!['EMERGENCY_7700', 'UNLAWFUL_7500', 'COMMS_7600', 'HOSTILE'].includes(ipop.kind) && ptr && <button onClick={() => { store.dispatch({ c: 'atc', trackId: ptr.id }); store.dispatch({ c: 'registry', trackId: ptr.id }); store.dispatch({ c: 'ack', incidentId: ipop.id }); show(ptr) }}>CHECK IT</button>}
          <button onClick={() => show(ptr)}>SHOW ME</button>
          <button onClick={() => { if (ipop.kind === 'EMERGENCY_7700' || ipop.kind === 'UNLAWFUL_7500') store.dispatch({ c: 'alertAirfield', incidentId: ipop.id }); store.dispatch({ c: 'ack', incidentId: ipop.id }); dismiss(ipop.id) }}>GOT IT</button></div></div>}
      {voice && <VoiceSetup onClose={() => setVoice(false)} />}
    </div>
  )
}

export function VoiceSetup({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(store.save.settings.elevenKey ?? '')
  const [msg, setMsg] = useState('')
  const apply = (k: string) => { store.save.settings.elevenKey = k.trim(); if (k.trim()) store.save.settings.elevenOn = true; store.persist(); store.applyAudio() }
  const on = store.save.settings.elevenOn !== false
  const test = () => {
    apply(key); audio.unlock(); audio.stopAll()
    audio.speak({ id: 0, t: 0, channel: 'PILOT', from: 'TEST', to: 'OPS', text: 'Skywatch, Wolf one five, tally one bandit, he is ignoring all calls. Request permission to engage.', voice: 'PILOT', sev: 'URGENT', speak: true })
    setMsg('Playing…'); setTimeout(() => setMsg(audio.elevenErr ? '✗ ' + audio.elevenErr : key ? '✓ ElevenLabs voice active — all radio lines will use it' : 'Using browser voices'), 5000)
  }
  return <div className="sg-popup" style={{ top: '22%' }}>
    <h3>VOICE SETUP — ELEVENLABS</h3>
    <p>Paste your ElevenLabs API key for realistic radio voices (a different voice per role). The key is saved only in this browser and sent only to api.elevenlabs.io. Leave empty to use built-in browser voices.</p>
    <input type="password" placeholder="ElevenLabs API key" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: '100%', fontSize: '1rem', padding: '.4rem' }} />
    <div className="sg-btns"><button onClick={test}>SAVE & TEST VOICE</button><button onClick={() => { apply(''); setKey(''); setMsg('Key removed') }}>REMOVE KEY</button>
      <button disabled={!key} onClick={() => { store.save.settings.elevenOn = !on; store.persist(); store.applyAudio(); audio.stopAll(); setMsg(!on ? 'ElevenLabs ON — every radio line uses it' : 'ElevenLabs OFF — using browser voices'); store.notify() }}>ELEVENLABS: {on && key ? 'ON' : 'OFF'}</button>
      <button onClick={() => { store.save.settings.voice = !store.save.settings.voice; store.persist(); store.applyAudio(); store.notify() }}>RADIO VOICE: {store.save.settings.voice ? 'ON' : 'OFF'}</button><button onClick={onClose}>CLOSE</button></div>
    {audio.elevenErr && audio.usingEleven && <p className="r">{audio.elevenErr}</p>}
    {msg && <p className="amber">{msg}</p>}
  </div>
}

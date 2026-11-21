import { useEffect, useRef, useState } from 'react'
import geo from '../sim/data/geography.json'
import { AIRPORTS } from '../sim/data/airports'
import { AIRWAYS, FIXES, FIX_MAP, REGIONS, ZONES } from '../sim/data/fixes'
import { ASSET_TYPES } from '../sim/data/aircraftTypes'
import { bearingDeg, destPoint, distNm, fmtPos, invMercY, mercY, rad, R_NM } from '../sim/geo'
import { radarEffective } from '../sim/radar'
import { label } from '../sim/identification'
import type { Category, GameState, Track } from '../sim/types'
import { store, useStore } from './store'

interface Poly { x: Float32Array; y: Float32Array; minX: number; maxX: number; minY: number; maxY: number }
const prep = (arr: number[][]): Poly => {
  const x = new Float32Array(arr.length), y = new Float32Array(arr.length)
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  arr.forEach((p, i) => { x[i] = rad(p[0]); y[i] = mercY(Math.max(-85, Math.min(85, p[1]))); minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]) })
  return { x, y, minX, maxX, minY, maxY }
}
const LAND = (geo as any).land.map(prep) as Poly[]
const COAST = (geo as any).coast.map(prep) as Poly[]
const BORDERS = (geo as any).borders.map(prep) as Poly[]

const COL: Record<Category, string> = { UNKNOWN: '#ffe34d', UNCORRELATED: '#ffb000', CORRELATED: '#4df08a', IDENTIFIED: '#4df08a', SUSPICIOUS: '#ff4545', UNRESOLVED: '#ff7ad9' }
const FRIEND = '#4db8ff'

export function RadarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const hits = useRef<{ id: string; x: number; y: number; asset?: string }[]>([])
  const [menu, setMenu] = useState<null | { x: number; y: number; track?: string; lat: number; lon: number }>(null)
  const [cursor, setCursor] = useState('')
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; moved: boolean } | null>(null)
  const scaleRef = useRef(1)
  const uiScale = useStore((s) => s.profile.settings.uiScale)
  useEffect(() => { scaleRef.current = uiScale }, [uiScale])

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!
    let raf = 0, w = 0, h = 0, dpr = 1
    const resize = () => { const r = wrap.current!.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px' }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(wrap.current!)
    const frame = () => { raf = requestAnimationFrame(frame); try { draw(ctx, w, h, dpr, hits.current, scaleRef.current) } catch (e) { console.error(e) } }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const projOf = () => { const r = wrap.current!.getBoundingClientRect(); return makeProj(r.width, r.height) }
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId); setMenu(null)
    drag.current = { x: e.clientX, y: e.clientY, lat: store.view.lat, lon: store.view.lon, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect(); const P = makeProj(r.width, r.height)
    const ll = P.inv(e.clientX - r.left, e.clientY - r.top)
    const o = originOf(store.st)
    setCursor(`${fmtPos(ll)}   BRG ${String(Math.round(bearingDeg(o, ll))).padStart(3, '0')}° / ${Math.round(distNm(o, ll))}NM from ${store.ringOrigin}`)
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) {
      const P0 = makeProj(r.width, r.height, { lat: d.lat, lon: d.lon, rangeNm: store.view.rangeNm })
      const c = P0.inv(P0.cx - dx, P0.cy - dy)
      store.view = { ...store.view, lat: Math.max(35, Math.min(72, c.lat)), lon: Math.max(-60, Math.min(40, c.lon)) }; store.ui('pan')
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null
    if (!d || d.moved) { store.notify(); return }
    const r = wrap.current!.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
    const P = makeProj(r.width, r.height); const ll = P.inv(x, y)
    if (store.pick?.kind === 'point') { const cb = store.pick.cb; store.pick = null; cb(ll); store.notify(); return }
    if (store.pick?.kind === 'measure') { if (!store.pick.a) store.pick = { kind: 'measure', a: ll }; else store.pick = null; store.notify(); return }
    const best = nearestHit(hits.current, x, y)
    if (best) { if (best.asset && !best.id) { store.sel.asset = best.asset; store.notify() } else store.select(best.id); if (best.asset) store.sel.asset = best.asset } else store.select(undefined)
  }
  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect(); const P = makeProj(r.width, r.height)
    const before = P.inv(e.clientX - r.left, e.clientY - r.top)
    const f = Math.exp(e.deltaY * 0.0012)
    const range = Math.max(8, Math.min(1800, store.view.rangeNm * f))
    const P2 = makeProj(r.width, r.height, { ...store.view, rangeNm: range })
    const after = P2.inv(e.clientX - r.left, e.clientY - r.top)
    store.view = { lat: store.view.lat + (before.lat - after.lat), lon: store.view.lon + (before.lon - after.lon), rangeNm: range }
    store.ui('zoom'); store.notify()
  }
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault()
    const r = wrap.current!.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
    const ll = makeProj(r.width, r.height).inv(x, y); const best = nearestHit(hits.current, x, y)
    if (best?.id) store.select(best.id)
    setMenu({ x, y, track: best?.id || undefined, lat: ll.lat, lon: ll.lon })
  }
  void projOf
  const st = store.st
  const sel = st && store.sel.track ? st.tracks[store.sel.track] : undefined
  return (
    <div ref={wrap} className="radar-wrap" onContextMenu={onCtx}>
      <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} style={{ cursor: store.pick ? 'crosshair' : 'default', touchAction: 'none' }} />
      <div className="cursor-readout">{cursor}{store.pick?.kind === 'point' ? `   ▶ ${store.pick.label}: CLICK MAP` : ''}{store.pick?.kind === 'measure' ? '   ▶ MEASURE: CLICK POINTS' : ''}</div>
      {menu && st && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {menu.track && sel && <>
            <div className="ctx-h">{sel.id} {label(st, sel)} · {sel.category}</div>
            <button onClick={() => { store.dispatch({ c: 'atc', trackId: sel.id }); setMenu(null) }}>ATC QUERY</button>
            <button onClick={() => { store.dispatch({ c: 'registry', trackId: sel.id }); setMenu(null) }}>REGISTRY CHECK</button>
            <button onClick={() => { const r = store.dispatch({ c: 'op', spec: { type: 'IDENTIFY', trackId: sel.id } }); if (r) alert(r); setMenu(null) }}>TASK: IDENTIFY</button>
            <button onClick={() => { const r = store.dispatch({ c: 'op', spec: { type: 'SHADOW', trackId: sel.id } }); if (r) alert(r); setMenu(null) }}>TASK: SHADOW</button>
            <button onClick={() => { const r = store.dispatch({ c: 'op', spec: { type: 'MONITOR', trackId: sel.id } }); if (r) alert(r); setMenu(null) }}>TASK: MONITOR</button>
            <button onClick={() => { store.dispatch({ c: 'watch', trackId: sel.id, on: !sel.watch }); setMenu(null) }}>{sel.watch ? 'UNWATCH' : 'WATCH TRACK'}</button>
          </>}
          <button onClick={() => { const r = store.dispatch({ c: 'op', spec: { type: 'PATROL', point: { lat: menu.lat, lon: menu.lon } } }); if (r) alert(r); setMenu(null) }}>PATROL HERE (AUTO)</button>
          <button onClick={() => { store.centreOn(menu); setMenu(null) }}>CENTRE HERE</button>
          <button onClick={() => { store.pick = { kind: 'measure', a: { lat: menu.lat, lon: menu.lon } }; setMenu(null); store.notify() }}>MEASURE FROM HERE</button>
          <button onClick={() => setMenu(null)}>CLOSE</button>
        </div>
      )}
    </div>
  )
}
function nearestHit(list: { id: string; x: number; y: number; asset?: string }[], x: number, y: number) {
  let best: (typeof list)[0] | null = null, bd = 18 * 18
  for (const h of list) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h } }
  return best
}
function originOf(st: GameState | null) {
  const r = st?.radars.find((x) => x.id === store.ringOrigin)
  return r && !r.airborne ? r : { lat: 55.42, lon: -1.61 }
}

export interface Proj { cx: number; cy: number; rpx: number; lon0: number; my0: number; x: (lon: number) => number; y: (lat: number) => number; inv: (x: number, y: number) => { lat: number; lon: number }; pxPerNm: (lat: number) => number }
export function makeProj(w: number, h: number, v = store.view): Proj {
  const ppn = h / 2 / v.rangeNm
  const rpx = ppn * R_NM * Math.cos(rad(v.lat))
  const lon0 = rad(v.lon), my0 = mercY(v.lat), cx = w / 2, cy = h / 2
  return { cx, cy, rpx, lon0, my0, x: (lon) => cx + (rad(lon) - lon0) * rpx, y: (lat) => cy - (mercY(lat) - my0) * rpx, inv: (x, y) => ({ lon: (lon0 + (x - cx) / rpx) * (180 / Math.PI), lat: invMercY(my0 + (cy - y) / rpx) }), pxPerNm: (lat) => rpx / (R_NM * Math.cos(rad(lat))) }
}

function strokePoly(ctx: CanvasRenderingContext2D, p: Poly, P: Proj, w: number, h: number, close: boolean) {
  const x0 = P.cx + (p.minX - P.lon0) * P.rpx, x1 = P.cx + (p.maxX - P.lon0) * P.rpx
  const y1 = P.cy - (p.minY - P.my0) * P.rpx, y0 = P.cy - (p.maxY - P.my0) * P.rpx
  if (x1 < -50 || x0 > w + 50 || y1 < -50 || y0 > h + 50) return false
  ctx.moveTo(P.cx + (p.x[0] - P.lon0) * P.rpx, P.cy - (p.y[0] - P.my0) * P.rpx)
  for (let i = 1; i < p.x.length; i++) ctx.lineTo(P.cx + (p.x[i] - P.lon0) * P.rpx, P.cy - (p.y[i] - P.my0) * P.rpx)
  if (close) ctx.closePath()
  return true
}
function circle(ctx: CanvasRenderingContext2D, P: Proj, c: { lat: number; lon: number }, nm: number, n = 72) {
  for (let i = 0; i <= n; i++) { const p = destPoint(c, (i / n) * 360, nm); const x = P.x(p.lon), y = P.y(p.lat); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
}
const alt100 = (a: number | null) => (a === null ? '---' : String(Math.round(a / 100)).padStart(3, '0'))

function symbol(ctx: CanvasRenderingContext2D, cat: Category, friend: boolean, x: number, y: number, s: number, coast: boolean) {
  ctx.beginPath()
  if (friend) {
    ctx.arc(x, y + s * 0.3, s, Math.PI, 0); ctx.lineTo(x + s, y + s * 0.3); ctx.lineTo(x - s, y + s * 0.3); ctx.closePath()
    ctx.fillStyle = FRIEND; ctx.fill(); ctx.strokeStyle = '#0a2a3a'; ctx.lineWidth = 1; ctx.stroke(); return
  }
  const c = COL[cat]; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.6
  if (coast) ctx.setLineDash([2, 2])
  switch (cat) {
    case 'UNKNOWN': { const r = s * 0.62; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.arc(x + dx * r, y + dy * r, r, 0, Math.PI * 2); ctx.stroke(); break }
    case 'UNCORRELATED': ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill(); break
    case 'CORRELATED': ctx.rect(x - s, y - s, s * 2, s * 2); ctx.stroke(); break
    case 'IDENTIFIED': ctx.rect(x - s, y - s, s * 2, s * 2); ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85; ctx.stroke(); break
    case 'SUSPICIOUS': ctx.moveTo(x, y - s * 1.25); ctx.lineTo(x + s * 1.25, y); ctx.lineTo(x, y + s * 1.25); ctx.lineTo(x - s * 1.25, y); ctx.closePath(); ctx.globalAlpha *= 0.8; ctx.fill(); ctx.globalAlpha /= 0.8; ctx.stroke(); break
    case 'UNRESOLVED': for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; const px = x + Math.cos(a) * s * 1.1, py = y + Math.sin(a) * s * 1.1; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) } ctx.closePath(); ctx.stroke(); break
  }
  ctx.setLineDash([])
}

let flash = 0
function draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, hits: { id: string; x: number; y: number; asset?: string }[], uiScale: number) {
  const st = store.st; const L = store.layers
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#03100a'; ctx.fillRect(0, 0, w, h)
  const P = makeProj(w, h)
  const fs = Math.round(11 * uiScale * Math.max(0.9, Math.min(1.6, h / 1000)))
  const sym = Math.round(5.5 * uiScale * Math.max(0.9, Math.min(1.5, h / 1000)))
  ctx.lineJoin = 'round'
  const rng = store.view.rangeNm
  const now = performance.now(); flash = Math.floor(now / 450) % 2

  // --- land
  ctx.beginPath(); for (const p of LAND) strokePoly(ctx, p, P, w, h, true)
  ctx.fillStyle = '#0c2a17'; ctx.fill()
  if (L.grid) {
    ctx.strokeStyle = 'rgba(60,150,90,0.12)'; ctx.lineWidth = 1; ctx.beginPath()
    const step = rng > 600 ? 10 : rng > 150 ? 5 : rng > 50 ? 1 : 0.5
    const tl = P.inv(0, 0), br = P.inv(w, h)
    for (let lo = Math.floor(tl.lon / step) * step; lo <= br.lon; lo += step) { ctx.moveTo(P.x(lo), 0); ctx.lineTo(P.x(lo), h) }
    for (let la = Math.floor(br.lat / step) * step; la <= tl.lat; la += step) { ctx.moveTo(0, P.y(la)); ctx.lineTo(w, P.y(la)) }
    ctx.stroke()
    ctx.fillStyle = 'rgba(90,190,120,0.5)'; ctx.font = `${fs - 1}px monospace`
    for (let lo = Math.floor(tl.lon / step) * step; lo <= br.lon; lo += step) ctx.fillText(`${Math.abs(lo)}${lo < 0 ? 'W' : 'E'}`, P.x(lo) + 2, h - 4)
    for (let la = Math.floor(br.lat / step) * step; la <= tl.lat; la += step) ctx.fillText(`${la}N`, 3, P.y(la) - 2)
  }
  if (L.coast) { ctx.beginPath(); for (const p of COAST) strokePoly(ctx, p, P, w, h, false); ctx.strokeStyle = '#58d07c'; ctx.lineWidth = 1.4; ctx.stroke() }
  if (L.borders) { ctx.beginPath(); for (const p of BORDERS) strokePoly(ctx, p, P, w, h, false); ctx.strokeStyle = 'rgba(90,180,120,0.45)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]) }

  // --- weather
  if (L.weather && st) for (const c of st.weather.cells) {
    const g = ctx.createRadialGradient(P.x(c.lon), P.y(c.lat), 0, P.x(c.lon), P.y(c.lat), c.r * P.pxPerNm(c.lat))
    g.addColorStop(0, `rgba(80,140,220,${0.28 * c.intensity})`); g.addColorStop(1, 'rgba(80,140,220,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x(c.lon), P.y(c.lat), c.r * P.pxPerNm(c.lat), 0, Math.PI * 2); ctx.fill()
  }
  // --- airspace
  if (L.regions) {
    ctx.font = `${fs - 1}px monospace`
    for (const r of REGIONS) {
      ctx.beginPath(); r.poly.forEach((p, i) => (i ? ctx.lineTo(P.x(p.lon), P.y(p.lat)) : ctx.moveTo(P.x(p.lon), P.y(p.lat)))); ctx.closePath()
      ctx.strokeStyle = r.kind === 'ADIZ' ? 'rgba(255,200,60,0.55)' : 'rgba(120,170,230,0.35)'; ctx.setLineDash(r.kind === 'ADIZ' ? [10, 5] : [3, 5]); ctx.lineWidth = r.kind === 'ADIZ' ? 1.6 : 1; ctx.stroke(); ctx.setLineDash([])
      const c = r.poly[0]; ctx.fillStyle = r.kind === 'ADIZ' ? 'rgba(255,200,60,0.7)' : 'rgba(130,180,240,0.55)'; ctx.fillText(r.name, P.x(c.lon) + 6, P.y(c.lat) + 14)
    }
  }
  if (L.zones) for (const z of ZONES) {
    ctx.beginPath(); circle(ctx, P, z, z.r, 40); ctx.strokeStyle = 'rgba(255,90,90,0.6)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([])
    if (rng < 500) { ctx.fillStyle = 'rgba(255,110,110,0.65)'; ctx.font = `${fs - 2}px monospace`; ctx.fillText(z.name, P.x(z.lon) - 30, P.y(z.lat)) }
  }
  // --- airways
  if (L.airways && rng < 1200) {
    ctx.strokeStyle = 'rgba(70,150,200,0.28)'; ctx.lineWidth = 1; ctx.beginPath()
    for (const a of AIRWAYS) a.fixes.forEach((f, i) => { const p = FIX_MAP[f]; if (i) ctx.lineTo(P.x(p.lon), P.y(p.lat)); else ctx.moveTo(P.x(p.lon), P.y(p.lat)) })
    ctx.stroke()
    if (rng < 420) { ctx.fillStyle = 'rgba(100,180,230,0.45)'; ctx.font = `${fs - 2}px monospace`; for (const a of AIRWAYS.slice(0, 12)) { const mid = FIX_MAP[a.fixes[Math.floor(a.fixes.length / 2)]]; ctx.fillText(a.name, P.x(mid.lon) + 4, P.y(mid.lat) - 4) } }
  }
  if (L.fixes && rng < 520) {
    ctx.font = `${fs - 2}px monospace`
    for (const f of FIXES) {
      const x = P.x(f.lon), y = P.y(f.lat); if (x < 0 || y < 0 || x > w || y > h) continue
      ctx.strokeStyle = f.offshore ? 'rgba(220,150,80,0.6)' : 'rgba(100,180,230,0.55)'; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x - 3, y + 2); ctx.closePath(); ctx.stroke()
      if (rng < 330) { ctx.fillStyle = f.offshore ? 'rgba(230,160,90,0.7)' : 'rgba(110,190,240,0.55)'; ctx.fillText(f.id, x + 5, y + 3) }
    }
  }
  if (L.airports) {
    ctx.font = `${fs - 1}px monospace`
    for (const a of AIRPORTS) {
      if (a.country !== 'GB' && a.country !== 'IE' && rng > 700) continue
      const big = a.size >= 4 || a.kind === 'MIL'
      if (rng > 450 && !big) continue
      if (rng > 250 && a.size < 2 && a.kind !== 'MIL') continue
      const x = P.x(a.lon), y = P.y(a.lat); if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue
      const af = st?.airfields[a.icao]
      ctx.strokeStyle = a.kind === 'MIL' ? (af && !af.open ? '#ff6060' : FRIEND) : '#9ad0b0'; ctx.lineWidth = 1.2
      ctx.beginPath(); if (a.kind === 'MIL') ctx.rect(x - 3.5, y - 3.5, 7, 7); else ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke()
      if (af?.alert) { ctx.strokeStyle = '#ff4040'; ctx.beginPath(); ctx.arc(x, y, 8 + flash * 2, 0, Math.PI * 2); ctx.stroke() }
      if (rng < 330 || big) { ctx.fillStyle = a.kind === 'MIL' ? 'rgba(110,190,255,0.85)' : 'rgba(170,220,190,0.75)'; ctx.fillText(rng < 160 ? a.name : a.icao, x + 6, y - 4) }
    }
  }

  // --- radar coverage, sweeps
  if (st) {
    const org = originOf(st)
    for (const r of st.radars) {
      if (r.airborne && r.status === 'OFFLINE') continue
      const eff = radarEffective(r)
      const col = r.status === 'OPERATIONAL' ? '70,255,130' : r.status === 'DEGRADED' ? '255,190,60' : r.status === 'MAINTENANCE' ? '120,170,255' : '255,70,70'
      const x = P.x(r.lon), y = P.y(r.lat)
      if (L.coverage) {
        const los = (alt: number) => 1.23 * (Math.sqrt(alt) + Math.sqrt(r.antennaFt))
        const hi = Math.min(r.primaryRange * (eff || 0.3), los(25000)), lo = Math.min(r.primaryRange * (eff || 0.3), los(3000))
        ctx.beginPath(); circle(ctx, P, r, hi); ctx.fillStyle = `rgba(${col},${eff > 0 ? 0.045 : 0.0})`; ctx.fill(); ctx.strokeStyle = `rgba(${col},0.45)`; ctx.setLineDash(eff > 0 ? [] : [6, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); circle(ctx, P, r, lo); ctx.strokeStyle = `rgba(${col},0.3)`; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([])
      }
      if (L.sweeps && eff > 0) {
        const radiusPx = Math.min(r.primaryRange * eff, 400) * P.pxPerNm(r.lat)
        if (x > -radiusPx && x < w + radiusPx && y > -radiusPx && y < h + radiusPx) {
          const a0 = r.angle
          for (let i = 0; i < 18; i++) {
            const a = rad(a0 - i * 2.2), a2 = rad(a0 - (i + 1) * 2.2)
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * radiusPx, y - Math.cos(a) * radiusPx); ctx.lineTo(x + Math.sin(a2) * radiusPx, y - Math.cos(a2) * radiusPx); ctx.closePath()
            ctx.fillStyle = `rgba(${col},${0.075 * (1 - i / 18)})`; ctx.fill()
          }
          ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(rad(a0)) * radiusPx, y - Math.cos(rad(a0)) * radiusPx); ctx.stroke()
        }
      }
      // station marker
      if (x > -20 && x < w + 20 && y > -20 && y < h + 20) {
        ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.5; ctx.beginPath()
        if (r.airborne) { ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6) } else { ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath() }
        ctx.stroke(); ctx.fillStyle = `rgb(${col})`; ctx.font = `${fs - 1}px monospace`; if (rng < 700 && !r.airborne) ctx.fillText(r.name.replace('RRH ', '').toUpperCase(), x + 8, y + 12)
      }
    }
    // range rings
    if (L.rings) {
      const px = P.pxPerNm(org.lat), ox = P.x(org.lon), oy = P.y(org.lat)
      const steps = [5, 10, 25, 50, 100, 200, 250]; let step = steps[steps.length - 1]; for (const s of steps) if (s * px > 70) { step = s; break }
      ctx.strokeStyle = 'rgba(90,220,140,0.22)'; ctx.lineWidth = 1
      const maxR = Math.hypot(w, h) / px
      ctx.font = `${fs - 2}px monospace`
      for (let r = step; r < maxR && r < 1500; r += step) { ctx.beginPath(); ctx.arc(ox, oy, r * px, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(120,230,160,0.55)'; ctx.fillText(String(r), ox + 3, oy - r * px - 2) }
      ctx.beginPath(); for (let b = 0; b < 360; b += 30) { ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.sin(rad(b)) * Math.min(maxR, 600) * px, oy - Math.cos(rad(b)) * Math.min(maxR, 600) * px) } ctx.strokeStyle = 'rgba(90,220,140,0.1)'; ctx.stroke()
    }
    // operation overlays
    for (const op of Object.values(st.ops)) {
      if (op.status !== 'ACTIVE' && op.status !== 'PLANNED') continue
      ctx.strokeStyle = 'rgba(77,184,255,0.7)'; ctx.fillStyle = 'rgba(77,184,255,0.9)'; ctx.lineWidth = 1.2
      if (op.point && (op.type === 'PATROL' || op.type === 'REFUEL')) {
        ctx.setLineDash([6, 4]); ctx.beginPath(); circle(ctx, P, op.point, op.radius ?? 10, 48); ctx.stroke(); ctx.setLineDash([])
        ctx.font = `${fs - 1}px monospace`; ctx.fillText(`${op.id} ${op.type}`, P.x(op.point.lon) + 6, P.y(op.point.lat) - 6)
      }
      const a = st.assets[op.assets[0]]
      if (a?.ac && (op.type === 'IDENTIFY' || op.type === 'SHADOW' || op.type === 'MONITOR')) {
        const e = op.entityId ? st.aircraft[op.entityId] : null; const tr = op.trackId ? st.tracks[op.trackId] : null
        const tp = tr && !tr.dropped ? tr : e
        if (tp) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(P.x(a.ac.lon), P.y(a.ac.lat)); ctx.lineTo(P.x(tp.lon), P.y(tp.lat)); ctx.stroke(); ctx.setLineDash([]) }
      }
      if (op.type === 'REFUEL' && st.assets[op.assets[0]]?.ac && st.assets[op.assets[1]]?.ac) { const t1 = st.assets[op.assets[0]].ac!, t2 = st.assets[op.assets[1]].ac!; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(P.x(t1.lon), P.y(t1.lat)); ctx.lineTo(P.x(t2.lon), P.y(t2.lat)); ctx.stroke(); ctx.setLineDash([]) }
    }

    // --- tracks
    hits.length = 0
    const trail = store.profile.settings.trail
    const sel = store.sel.track
    const crowded = Object.keys(st.tracks).length > 90 && rng > 250
    ctx.font = `${fs}px "Lucida Console", Monaco, monospace`
    for (const tr of Object.values(st.tracks)) {
      if (tr.dropped) continue
      const ent = st.aircraft[tr.entityId]
      if (ent?.kind === 'asset') continue
      const x = P.x(tr.lon), y = P.y(tr.lat)
      if (x < -60 || y < -40 || x > w + 60 || y > h + 40) continue
      const age = st.t - tr.lastPlot
      const alpha = Math.max(0.45, 1 - age / 28)
      ctx.globalAlpha = alpha
      if (L.trails && trail > 0) {
        let n = 0, lastT = 1e12
        for (let i = tr.plots.length - 1; i >= 0 && n < trail; i--) { const p = tr.plots[i]; if (lastT - p.t < 9) continue; lastT = p.t; n++; ctx.fillStyle = COL[tr.category]; ctx.globalAlpha = alpha * (0.6 - n * (0.5 / (trail + 1))); ctx.fillRect(P.x(p.lon) - 1, P.y(p.lat) - 1, 2, 2) }
        ctx.globalAlpha = alpha
      }
      const emerg = tr.squawk === '7500' || tr.squawk === '7600' || tr.squawk === '7700'
      if (emerg && flash) { ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, sym * 2.4, 0, Math.PI * 2); ctx.stroke() }
      // velocity leader (1 minute)
      if (tr.gs > 30) { const lx = x + Math.sin(rad(tr.hdg)) * (tr.gs / 60) * P.pxPerNm(tr.lat), ly = y - Math.cos(rad(tr.hdg)) * (tr.gs / 60) * P.pxPerNm(tr.lat); ctx.strokeStyle = COL[tr.category]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.stroke() }
      symbol(ctx, tr.category, tr.iff4, x, y, sym, tr.coasting)
      if (sel === tr.id) { const b = sym + 5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x + sx * b, y + sy * (b - 5)); ctx.lineTo(x + sx * b, y + sy * b); ctx.lineTo(x + sx * (b - 5), y + sy * b) } ctx.stroke() }
      if (tr.watch) { ctx.fillStyle = '#fff'; ctx.fillText('★', x - sym - 12, y - sym) }
      if (L.labels && (!crowded || sel === tr.id || tr.category !== 'CORRELATED')) {
        const lx = x + sym + 6, ly = y - sym - 2
        ctx.fillStyle = COL[tr.category]
        const ent2 = ent
        const name = label(st, tr)
        const lvl = tr.alt === null ? '---' : (tr.altEst ? '~' : '') + alt100(tr.alt)
        const arrow = tr.vs > 300 ? '↑' : tr.vs < -300 ? '↓' : '='
        ctx.fillText(name + (tr.squawk && /^7[567]00$/.test(tr.squawk) ? ' ' + tr.squawk : ''), lx, ly)
        if ((rng < 600 && !(rng > 250 && tr.category === 'CORRELATED')) || sel === tr.id) ctx.fillText(`${lvl}${arrow} ${String(Math.round(tr.gs)).padStart(3, '0')}`, lx, ly + fs + 1)
        if ((rng < 160 || sel === tr.id) && ent2) ctx.fillText(`${tr.squawk ?? '----'} ${ent2.kind === 'civil' && tr.ms ? ent2.typeId : ''}`, lx, ly + (fs + 1) * 2)
      }
      ctx.globalAlpha = 1
      hits.push({ id: tr.id, x, y })
    }
    // assets via datalink
    for (const a of Object.values(st.assets)) {
      if (!a.ac) continue
      const x = P.x(a.ac.lon), y = P.y(a.ac.lat)
      if (x < -60 || y < -40 || x > w + 60 || y > h + 40) continue
      const tid = st.trackByEntity[a.id]
      ctx.fillStyle = FRIEND; ctx.strokeStyle = FRIEND
      const ls = a.ac.gs / 60 * P.pxPerNm(a.ac.lat); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(rad(a.ac.hdg)) * ls, y - Math.cos(rad(a.ac.hdg)) * ls); ctx.stroke()
      symbol(ctx, 'IDENTIFIED', true, x, y, sym, false)
      if (store.sel.asset === a.id) { ctx.strokeStyle = '#fff'; ctx.strokeRect(x - sym - 4, y - sym - 4, sym * 2 + 8, sym * 2 + 8) }
      if (a.lowWarned && flash) { ctx.strokeStyle = '#ffb000'; ctx.beginPath(); ctx.arc(x, y, sym * 2, 0, Math.PI * 2); ctx.stroke() }
      ctx.fillStyle = FRIEND; ctx.fillText(a.callsign, x + sym + 6, y - sym - 2); ctx.fillText(`${alt100(a.ac.alt)} ${Math.round(a.ac.gs)} F${Math.round(a.fuelKg / 100) / 10}`, x + sym + 6, y - sym + fs - 1)
      hits.push({ id: tid && st.tracks[tid] && !st.tracks[tid].dropped ? tid : '', x, y, asset: a.id })
    }
    // measure tool
    if (store.pick?.kind === 'measure' && store.pick.a) { const a = store.pick.a; ctx.fillStyle = '#fff'; ctx.fillRect(P.x(a.lon) - 2, P.y(a.lat) - 2, 4, 4) }
  }
  ctx.globalAlpha = 1
  // range scale bar + selected-origin tag
  ctx.fillStyle = 'rgba(150,240,180,0.8)'; ctx.font = `${fs}px monospace`
  const nm = rng > 400 ? 100 : rng > 150 ? 50 : rng > 60 ? 20 : 5; const px = nm * P.pxPerNm(store.view.lat)
  ctx.fillRect(14, h - 30, px, 2); ctx.fillText(`${nm} NM`, 14, h - 36)
  ctx.fillText(`RANGE ${Math.round(rng)}NM   RINGS ORIGIN ${store.ringOrigin}`, 14, h - 52)
}

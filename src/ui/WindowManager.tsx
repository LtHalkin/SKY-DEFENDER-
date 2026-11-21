import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadLayout, saveLayout, clearLayout, type Layout, type PanelRect } from './profile'
import { store, useStore } from './store'

export interface PanelDef { id: string; title: string; render: () => ReactNode; def: Omit<PanelRect, 'z'> }
const MINW = 0.12, MINH = 0.1
export function useLayout(panels: PanelDef[]) {
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = loadLayout(); const base: Layout = {}
    panels.forEach((p, i) => { base[p.id] = { ...p.def, z: i + 1, ...(saved?.[p.id] ?? {}) } })
    return base
  })
  const update = (fn: (l: Layout) => Layout) => setLayout((l) => { const n = fn(l); saveLayout(n); return n })
  const reset = () => { clearLayout(); const base: Layout = {}; panels.forEach((p, i) => { base[p.id] = { ...p.def, z: i + 1 } }); setLayout(base); saveLayout(base) }
  return { layout, update, reset }
}
export function tile(panels: PanelDef[], l: Layout): Layout {
  const open = panels.filter((p) => l[p.id].open); const n = open.length || 1
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols)
  const out = { ...l }
  open.forEach((p, i) => { const c = i % cols, r = Math.floor(i / cols); out[p.id] = { ...l[p.id], x: 0.01 + (c * 0.98) / cols, y: 0.07 + (r * 0.91) / rows, w: 0.98 / cols - 0.005, h: 0.91 / rows - 0.01 } })
  return out
}
export function Windows({ panels, layout, update }: { panels: PanelDef[]; layout: Layout; update: (fn: (l: Layout) => Layout) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const req = useStore((s) => s.panelRequest)
  useEffect(() => {
    if (!req) return
    store.panelRequest = null
    update((l) => { const z = Math.max(...Object.values(l).map((x) => x.z)) + 1; return { ...l, [req]: { ...l[req], open: true, z } } })
    store.ui('panel:' + req)
  }, [req])
  const bring = (id: string) => update((l) => { const mx = Math.max(...Object.values(l).map((x) => x.z)); return l[id].z === mx ? l : { ...l, [id]: { ...l[id], z: mx + 1 } } })
  return (
    <div className="windows" ref={box}>
      {panels.map((p) => <Win key={p.id} p={p} r={layout[p.id]} box={box} update={update} bring={bring} />)}
    </div>
  )
}
function Win({ p, r, box, update, bring }: { p: PanelDef; r: PanelRect; box: React.RefObject<HTMLDivElement | null>; update: (fn: (l: Layout) => Layout) => void; bring: (id: string) => void }) {
  const [mx, setMx] = useState(false)
  if (!r.open) return null
  const begin = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault(); bring(p.id)
    const b = box.current!.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY, o = { ...r }
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / b.width, dy = (ev.clientY - sy) / b.height
      update((l) => ({ ...l, [p.id]: mode === 'move' ? { ...l[p.id], x: Math.max(-o.w + 0.1, Math.min(0.98, o.x + dx)), y: Math.max(0, Math.min(0.97, o.y + dy)) } : { ...l[p.id], w: Math.max(MINW, Math.min(1, o.w + dx)), h: Math.max(MINH, Math.min(1, o.h + dy)) } }))
    }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const style = mx ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: 999 } : { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, zIndex: r.z }
  return (
    <div className="win" style={style} onPointerDown={() => bring(p.id)}>
      <div className="wtitle" onPointerDown={begin('move')} onDoubleClick={() => setMx(!mx)}><span>{p.title}</span>
        <span className="wbtn"><button onClick={() => setMx(!mx)} title="Maximise">{mx ? '❐' : '□'}</button><button onClick={() => update((l) => ({ ...l, [p.id]: { ...l[p.id], open: false } }))} title="Hide">✕</button></span></div>
      <div className="wbody">{p.render()}</div>
      {!mx && <div className="wresize" onPointerDown={begin('resize')} />}
    </div>
  )
}

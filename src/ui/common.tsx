import type { ReactNode } from 'react'
import type { Category } from '../sim/types'
export const CAT_COL: Record<Category, string> = { UNKNOWN: '#ffe34d', UNCORRELATED: '#ffb000', CORRELATED: '#4df08a', IDENTIFIED: '#7dffb0', SUSPICIOUS: '#ff5050', UNRESOLVED: '#ff7ad9' }
export const CAT_SHORT: Record<Category, string> = { UNKNOWN: 'UNK', UNCORRELATED: 'UNCOR', CORRELATED: 'CORR', IDENTIFIED: 'IDENT', SUSPICIOUS: 'SUSP', UNRESOLVED: 'UNRES' }
export const Badge = ({ cat }: { cat: Category }) => <span className="badge" style={{ color: CAT_COL[cat], borderColor: CAT_COL[cat] }}>{CAT_SHORT[cat]}</span>
export const Bar = ({ v, warn = 0.25, crit = 0.12, label }: { v: number; warn?: number; crit?: number; label?: string }) => {
  const c = v < crit ? 'var(--red)' : v < warn ? 'var(--amber)' : 'var(--green)'
  return <span className="bar" title={label}><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: c }} /><b>{label ?? Math.round(v * 100) + '%'}</b></span>
}
export const Btn = ({ children, onClick, disabled, kind, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'warn' | 'ok' | 'danger'; title?: string }) =>
  <button className={`btn ${kind ?? ''}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>
export const Row = ({ k, v, c }: { k: string; v: ReactNode; c?: string }) => <div className="kv"><span>{k}</span><b style={c ? { color: c } : undefined}>{v}</b></div>
export const fl = (a: number | null) => (a === null ? '---' : 'FL' + String(Math.round(a / 100)).padStart(3, '0'))
export const tonnes = (kg: number) => (kg / 1000).toFixed(1) + 't'
export const hm = (t: number) => { const s = Math.floor(t); return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}${String(Math.floor(s / 60) % 60).padStart(2, '0')}Z` }
export const hms = (t: number) => { const s = Math.floor(t); return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export const dur = (s: number) => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` }

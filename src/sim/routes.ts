import { AIRPORT_MAP, AIRPORTS } from './data/airports'
import { AIRWAYS, FIXES, FIX_MAP, GATE_FOR } from './data/fixes'
import { distNm } from './geo'
import type { Wp } from './types'

type Node = { id: string; lat: number; lon: number; name: string }
const nodes: Record<string, Node> = {}
const adj: Record<string, Map<string, number>> = {}
const link = (a: string, b: string) => {
  const d = distNm(nodes[a], nodes[b])
  ;(adj[a] ??= new Map()).set(b, d); (adj[b] ??= new Map()).set(a, d)
}
for (const f of FIXES) nodes['F:' + f.id] = { id: 'F:' + f.id, lat: f.lat, lon: f.lon, name: f.id }
for (const w of AIRWAYS) for (let i = 0; i < w.fixes.length - 1; i++) {
  if (!FIX_MAP[w.fixes[i]] || !FIX_MAP[w.fixes[i + 1]]) throw new Error('bad airway ' + w.name)
  link('F:' + w.fixes[i], 'F:' + w.fixes[i + 1])
}
const nearest: Record<string, string[]> = {}
for (const a of AIRPORTS) {
  if (a.country === 'EU' || a.country === 'NA' || a.country === 'FAR') continue
  nodes['A:' + a.icao] = { id: 'A:' + a.icao, lat: a.lat, lon: a.lon, name: a.icao }
  const fx = FIXES.filter((f) => !f.offshore).map((f) => ({ f, d: distNm(a, f) })).sort((x, y) => x.d - y.d)
  const picks = fx.slice(0, 3).map((x) => 'F:' + x.f.id)
  nearest[a.icao] = picks
  for (const p of picks) link('A:' + a.icao, p)
}
/** Route graph node for an airport: simulated airports directly, overseas ones via their gate fix. */
export function nodeFor(icao: string): string {
  const ap = AIRPORT_MAP[icao]
  if (!ap) throw new Error('unknown airport ' + icao)
  if (nodes['A:' + icao]) return 'A:' + icao
  const g = GATE_FOR[icao]; if (!g) throw new Error('no gate for ' + icao)
  return 'F:' + g
}
export const isSimAirport = (icao: string) => !!nodes['A:' + icao]
const cache = new Map<string, Wp[]>()
export function findPath(fromNode: string, toNode: string): Wp[] {
  const key = fromNode + '>' + toNode
  const c = cache.get(key); if (c) return c.map((w) => ({ ...w }))
  const dist: Record<string, number> = { [fromNode]: 0 }, prev: Record<string, string> = {}, done = new Set<string>()
  const open = new Set<string>([fromNode])
  while (open.size) {
    let cur = '', best = Infinity
    for (const o of open) if (dist[o] < best) { best = dist[o]; cur = o }
    open.delete(cur); done.add(cur)
    if (cur === toNode) break
    for (const [n, d] of adj[cur] ?? []) {
      if (done.has(n)) continue
      const nd = dist[cur] + d
      if (nd < (dist[n] ?? Infinity)) { dist[n] = nd; prev[n] = cur; open.add(n) }
    }
  }
  if (dist[toNode] === undefined) throw new Error(`no path ${fromNode}->${toNode}`)
  const ids: string[] = []; for (let c2: string | undefined = toNode; c2; c2 = prev[c2]) ids.unshift(c2)
  const wps = ids.map((id) => ({ name: nodes[id].name, lat: nodes[id].lat, lon: nodes[id].lon }))
  cache.set(key, wps)
  return wps.map((w) => ({ ...w }))
}
export function routeBetween(dep: string, arr: string): Wp[] {
  const w = findPath(nodeFor(dep), nodeFor(arr))
  // collapse backtracking at the airport ends (first fix behind the airport relative to direction of travel)
  if (w.length >= 3 && distNm(w[0], w[2]) < distNm(w[1], w[2]) + 1 && isSimAirport(dep)) w.splice(1, 1)
  const n = w.length
  if (n >= 3 && isSimAirport(arr) && distNm(w[n - 3], w[n - 1]) < distNm(w[n - 3], w[n - 2]) + 1) w.splice(n - 2, 1)
  return w
}
export function routeLength(w: Wp[]) { let d = 0; for (let i = 0; i < w.length - 1; i++) d += distNm(w[i], w[i + 1]); return d }

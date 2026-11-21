// Builds src/sim/data/geography.json from Natural Earth (public domain) via the world-atlas package.
import fs from 'node:fs'
import { feature, mesh } from 'topojson-client'
const BB = { w: -42, e: 28, s: 33, n: 72 }
const land = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-50m.json'))
const countries = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'))
const r = (v) => Math.round(v * 100) / 100

function dp(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const st = [[0, pts.length - 1]]
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = dx * dx + dy * dy || 1e-12
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L))
      const px = ax + t * dx, py = ay + t * dy; const d = Math.hypot(pts[i][0] - px, pts[i][1] - py)
      if (d > md) { md = d; mi = i }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const inb = (p) => p[0] >= BB.w && p[0] <= BB.e && p[1] >= BB.s && p[1] <= BB.n
function clipLine(line) { // split into runs inside bbox (keeping one point outside for continuity)
  const out = []; let cur = []
  for (let i = 0; i < line.length; i++) {
    if (inb(line[i])) { if (!cur.length && i > 0) cur.push(line[i - 1]); cur.push(line[i]) }
    else { if (cur.length) { cur.push(line[i]); out.push(cur); cur = [] } }
  }
  if (cur.length) out.push(cur)
  return out
}
function clipPoly(ring) { // Sutherland-Hodgman
  const edges = [
    [(p) => p[0] >= BB.w, (a, b) => { const t = (BB.w - a[0]) / (b[0] - a[0]); return [BB.w, a[1] + t * (b[1] - a[1])] }],
    [(p) => p[0] <= BB.e, (a, b) => { const t = (BB.e - a[0]) / (b[0] - a[0]); return [BB.e, a[1] + t * (b[1] - a[1])] }],
    [(p) => p[1] >= BB.s, (a, b) => { const t = (BB.s - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BB.s] }],
    [(p) => p[1] <= BB.n, (a, b) => { const t = (BB.n - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BB.n] }],
  ]
  let o = ring
  for (const [inside, inter] of edges) {
    const inp = o; o = []
    for (let i = 0; i < inp.length; i++) {
      const c = inp[i], p = inp[(i + inp.length - 1) % inp.length]
      if (inside(c)) { if (!inside(p)) o.push(inter(p, c)); o.push(c) } else if (inside(p)) o.push(inter(p, c))
    }
    if (!o.length) break
  }
  return o
}
const fmt = (pts) => pts.map((p) => [r(p[0]), r(p[1])])
const polys = []
for (const f of feature(land, land.objects.land).features) {
  const g = f.geometry; const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const poly of ps) {
    const ring = poly[0]; const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
    if (Math.max(...xs) < BB.w || Math.min(...xs) > BB.e || Math.max(...ys) < BB.s || Math.min(...ys) > BB.n) continue
    const c = clipPoly(ring); if (c.length < 3) continue
    polys.push(fmt(dp(c, 0.012)))
  }
}
const coast = []
const cm = mesh(land, land.objects.land)
for (const line of cm.coordinates) for (const seg of clipLine(line)) { const d = dp(seg, 0.012); if (d.length > 1) coast.push(fmt(d)) }
const borders = []
const bm = mesh(countries, countries.objects.countries, (a, b) => a !== b)
for (const line of bm.coordinates) for (const seg of clipLine(line)) { const d = dp(seg, 0.02); if (d.length > 1) borders.push(fmt(d)) }
const out = { land: polys, coast, borders }
fs.writeFileSync('src/sim/data/geography.json', JSON.stringify(out))
console.log('land', polys.length, 'coast', coast.length, 'borders', borders.length, 'bytes', fs.statSync('src/sim/data/geography.json').size)

/** Deterministic seeded PRNG (mulberry32). State is a single uint32 so it serialises with the sim state. */
export class Rng {
  s: number
  constructor(seed: number) { this.s = seed >>> 0 }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number) { return a + (b - a) * this.next() }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)) }
  chance(p: number) { return this.next() < p }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)] }
  gauss() { let u = 0; while (u === 0) u = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next()) }
  weighted<T>(items: readonly T[], w: (t: T) => number): T {
    let tot = 0; for (const i of items) tot += w(i)
    let r = this.next() * tot
    for (const i of items) { r -= w(i); if (r <= 0) return i }
    return items[items.length - 1]
  }
}
/** Stable string hash -> uint32 (used for registry generation, independent of sim rng). */
export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

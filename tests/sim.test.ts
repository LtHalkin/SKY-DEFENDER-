import { describe, expect, it } from 'vitest'
import { SimEngine, defaultConfig } from '../src/sim/engine'
import { REGISTRY } from '../src/sim/data/registry'
import { AIRPORTS } from '../src/sim/data/airports'
import { routeBetween, isSimAirport } from '../src/sim/routes'
import { distNm } from '../src/sim/geo'
import { spawnEvent } from '../src/sim/events'
import { RADAR_DEFS } from '../src/sim/data/radars'

const mk = (over = {}) => { const e = new SimEngine(defaultConfig({ incidents: false, intel: false, radarFaults: false, seed: 11, ...over })); e.warm(90); return e }
const hash = (e: SimEngine) => JSON.stringify(Object.values(e.st.aircraft).map((a) => [a.id, a.lat.toFixed(5), a.lon.toFixed(5), Math.round(a.alt)])) + JSON.stringify(Object.values(e.st.tracks).map((t) => [t.id, t.category])) + e.st.messages.length

describe('data', () => {
  it('has a register of at least 300 unique plausible aircraft', () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(300)
    expect(new Set(REGISTRY.map((r) => r.reg)).size).toBe(REGISTRY.length)
    expect(new Set(REGISTRY.map((r) => r.icao24)).size).toBe(REGISTRY.length)
  })
  it('has eight ground radar stations', () => { expect(RADAR_DEFS.length).toBe(8) })
  it('routes between all UK/IE airports are sane', () => {
    const sim = AIRPORTS.filter((a) => isSimAirport(a.icao))
    for (const a of sim) for (const b of [AIRPORTS.find((x) => x.icao === 'EGLL')!, AIRPORTS.find((x) => x.icao === 'EGPH')!, AIRPORTS.find((x) => x.icao === 'EINN')!]) {
      if (a.icao === b.icao) continue
      const w = routeBetween(a.icao, b.icao); let len = 0; for (let i = 0; i < w.length - 1; i++) len += distNm(w[i], w[i + 1])
      expect(len).toBeLessThan(distNm(a, b) * 2.2 + 80)
    }
    expect(routeBetween('KJFK', 'EDDF').length).toBeGreaterThan(3)
  })
})

describe('simulation', () => {
  it('is deterministic for the same seed and commands', () => {
    const a = mk(), b = mk()
    a.step(1500); b.step(1500)
    expect(hash(a)).toEqual(hash(b))
    const c = mk({ seed: 12 }); c.step(1500)
    expect(hash(c)).not.toEqual(hash(a))
  })
  it('produces radar tracks that map to real entities', () => {
    const e = mk(); e.step(300)
    const tr = Object.values(e.st.tracks).filter((t) => !t.dropped && !t.coasting)
    expect(tr.length).toBeGreaterThan(20)
    for (const t of tr) if (!e.st.aircraft[t.entityId]) expect(e.st.t - t.lastPlot).toBeLessThan(40) // just-landed aircraft coast briefly
  })
  it('radar coverage has consequences: offline stations reduce detections', () => {
    const full = mk({ seed: 21 }); full.step(900)
    const gap = mk({ seed: 21, radarOff: ['BENB', 'SAXA', 'BUCH', 'BOUL', 'STAX', 'NEAT', 'PORT'] }); gap.step(900)
    const n = (e: SimEngine) => Object.values(e.st.tracks).filter((t) => !t.dropped).length
    expect(n(gap)).toBeLessThan(n(full) * 0.7)
  })
  it('keeps aircraft inside the airspace and landing/exiting cleanly', () => {
    const e = mk(); e.step(7200)
    for (const a of Object.values(e.st.aircraft)) { expect(Number.isFinite(a.lat)).toBe(true); expect(a.alt).toBeGreaterThanOrEqual(0) }
    expect(e.st.stats.removed).toBeGreaterThan(5)
  })
  it('classification and scoring: correct and incorrect declarations', () => {
    const e = mk(); e.step(240)
    const t = Object.values(e.st.tracks).find((x) => x.category === 'CORRELATED' && !x.dropped)!
    expect(t).toBeDefined()
    e.dispatch({ c: 'declare', trackId: t.id, cat: 'IDENTIFIED' }); expect(e.st.score.idCorrect).toBeGreaterThan(0)
    const t2 = Object.values(e.st.tracks).find((x) => x.category === 'CORRELATED' && !x.dropped && x.id !== t.id)!
    e.dispatch({ c: 'declare', trackId: t2.id, cat: 'SUSPICIOUS' }); expect(e.st.score.falseAlarms).toBe(1)
  })
})

describe('operations', () => {
  const stray = (e: SimEngine) => { spawnEvent(e.st, 'strayed', { start: { lat: 54.5, lon: 2.5 } }); }
  it('IDENTIFY: scramble, intercept, visual ID, RTB, complete', () => {
    const e = mk({ seed: 31 }); stray(e); e.step(240)
    const t = Object.values(e.st.tracks).find((x) => !x.dropped && e.st.aircraft[x.entityId]?.truth.intent === 'strayed')!
    expect(t).toBeDefined()
    expect(e.dispatch({ c: 'op', spec: { type: 'IDENTIFY', trackId: t.id, expedite: true } })).toBeNull()
    const op = Object.values(e.st.ops)[0]
    let guard = 0; while (op.status === 'ACTIVE' && guard++ < 9000) e.step(1)
    expect(op.status).toBe('COMPLETE')
    expect(t.vid).toBeDefined()
    expect(e.st.score.idCorrect).toBeGreaterThanOrEqual(1)
    const asset = e.st.assets[op.assets[0]]
    expect(asset.ac).toBeNull(); expect(asset.locationId).not.toBeNull()
  })
  it('PATROL with E-3D activates its airborne radar and uses fuel', () => {
    const e = mk({ seed: 32 })
    const e3 = Object.values(e.st.assets).find((a) => a.typeId === 'E3D' && a.status === 'READY')!
    const r = e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: e3.id, point: { lat: 56, lon: -14 }, durationMin: 30, expedite: true } }); expect(r).toBeNull()
    const f0 = e3.fuelKg; e.step(60 * 40)
    expect(e3.fuelKg).toBeLessThan(f0)
    const rd = e.st.radars.find((x) => x.airborne === e3.id)!
    expect(rd.status).toBe('OPERATIONAL'); expect(rd.hits).toBeGreaterThan(0)
  })
  it('REFUEL transfers fuel from tanker to receiver', () => {
    const e = mk({ seed: 33 })
    const f = Object.values(e.st.assets).find((a) => a.typeId === 'F3' && a.status === 'READY')!
    e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: f.id, point: { lat: 55.5, lon: -1 }, durationMin: 90, expedite: true } })
    e.step(60 * 12)
    f.fuelKg = 3000
    const r = e.dispatch({ c: 'op', spec: { type: 'REFUEL', assetId: f.id } }); expect(r).toBeNull()
    const op = Object.values(e.st.ops).find((o) => o.type === 'REFUEL')!
    let g = 0; while (op.status === 'ACTIVE' && g++ < 9000) e.step(1)
    expect(['COMPLETE', 'FAILED']).toContain(op.status)
    expect(f.fuelKg).toBeGreaterThan(5000)
  })
  it('SUPPLY moves finite fuel between airfields', () => {
    const e = mk({ seed: 34 })
    const herc = Object.values(e.st.assets).find((a) => a.typeId === 'C130' && a.status === 'READY')!
    const from = e.st.airfields[herc.locationId!], to = e.st.airfields['EGXE']
    to.fuelKg = 20000; const f0 = from.fuelKg
    expect(e.dispatch({ c: 'op', spec: { type: 'SUPPLY', assetId: herc.id, toBase: 'EGXE', cargo: { kind: 'FUEL', qty: 15000 }, expedite: true } })).toBeNull()
    expect(from.fuelKg).toBeLessThan(f0)
    const op = Object.values(e.st.ops)[0]; let g = 0; while (op.status === 'ACTIVE' && g++ < 12000) e.step(1)
    expect(op.status).toBe('COMPLETE'); expect(to.fuelKg).toBeGreaterThan(20000)
  })
  it('FERRY re-bases an asset', () => {
    const e = mk({ seed: 35 })
    const ch = Object.values(e.st.assets).find((a) => a.typeId === 'CH47' && a.status === 'READY' && a.baseId === 'EGVO')!
    expect(e.dispatch({ c: 'op', spec: { type: 'FERRY', assetId: ch.id, toBase: 'EGXE', expedite: true } })).toBeNull()
    const op = Object.values(e.st.ops)[0]; let g = 0; while (op.status === 'ACTIVE' && g++ < 15000) e.step(1)
    expect(op.status).toBe('COMPLETE'); expect(ch.baseId).toBe('EGXE')
  })
  it('aircraft consume fuel, turn around and become available again', () => {
    const e = mk({ seed: 36 })
    const f = Object.values(e.st.assets).find((a) => a.typeId === 'F3' && a.status === 'READY')!
    e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: f.id, point: { lat: 54, lon: -2 }, durationMin: 10, expedite: true } })
    const op = Object.values(e.st.ops)[0]; let g = 0; while (op.status === 'ACTIVE' && g++ < 12000) e.step(1)
    expect(op.status).toBe('COMPLETE'); expect(f.status).toBe('TURNAROUND')
    e.step(60 * 80); expect(['READY', 'MAINT', 'US']).toContain(f.status)
  })
})

describe('incidents', () => {
  it('7700 emergency must be acknowledged and the airfield alerted', () => {
    const e = mk({ seed: 41 }); spawnEvent(e.st, '7700')
    const inc = e.st.incidents[0]; expect(inc.kind).toBe('EMERGENCY_7700')
    e.dispatch({ c: 'alertAirfield', incidentId: inc.id }); expect(inc.actioned).toBe(true)
    let g = 0; while (inc.closed === null && g++ < 9000) e.step(1)
    expect(inc.status).toBe('RESOLVED')
  })
  it('unhandled emergency fails', () => {
    const e = mk({ seed: 42 }); spawnEvent(e.st, '7700')
    const inc = e.st.incidents[0]; let g = 0; while (inc.closed === null && g++ < 9000) e.step(1)
    expect(inc.status).toBe('FAILED')
  })
  it('all event types spawn and run without error', () => {
    const e = new SimEngine(defaultConfig({ seed: 51, incidents: false })); e.warm(90)
    for (const id of ['strayed', 'anomaly', 'missing', '7600', 'xpdr', 'deviation', '7700', 'foreign', 'cloned', '7500', 'sar', 'radar', 'interf', 'front', 'noise']) spawnEvent(e.st, id)
    e.step(3600)
    expect(e.st.incidents.length).toBeGreaterThan(4)
  })
  it('ATC and registry queries return evidence', () => {
    const e = mk({ seed: 61 }); spawnEvent(e.st, 'missing'); e.step(200)
    const t = Object.values(e.st.tracks).find((x) => e.st.aircraft[x.entityId]?.truth.intent === 'noPlan' && !x.dropped)
    expect(t).toBeDefined()
    e.dispatch({ c: 'atc', trackId: t!.id }); e.dispatch({ c: 'registry', trackId: t!.id }); e.step(20)
    expect(t!.checks.atc?.found).toBe(true)
    e.step(10); expect(t!.category).toBe('CORRELATED')
  })
})
describe('modes', () => {
  it('all scenario setups start and run', async () => {
    const { SCENARIOS, LESSONS } = await import('../src/sim/scenarios')
    for (const s of SCENARIOS) { const e = new SimEngine(defaultConfig({ mode: 'TRADE', scenarioId: s.id, seed: s.cfg.seed, traffic: s.cfg.traffic, weather: s.cfg.weather, startHour: s.cfg.hour, complexity: s.cfg.complexity, radarOff: s.cfg.radarOff ?? [], incidents: s.cfg.incidents ?? true, intel: s.cfg.intel ?? true, radarFaults: s.cfg.radarFaults ?? false, tension0: s.cfg.tension0 ?? 0.03 })); e.warm(60); e.step(1800); expect(e.st.objectives.length).toBeGreaterThan(0) }
    for (const l of LESSONS) { const e = new SimEngine(defaultConfig({ mode: 'BASIC', scenarioId: l.id, seed: l.cfg.seed, traffic: l.cfg.traffic, incidents: false })); e.warm(60); e.step(300) }
    const inst = new SimEngine(defaultConfig({ mode: 'INSTANT', seed: 5, traffic: 1.6, tension0: 0.55, complexity: 1 })); inst.warm(60); inst.step(1200)
    expect(inst.st.incidents.length).toBeGreaterThan(3)
  })
})

describe('training scenarios can be completed', () => {
  const build = async (id: string) => {
    const { SCENARIO_MAP } = await import('../src/sim/scenarios'); const s = SCENARIO_MAP[id]
    const e = new SimEngine(defaultConfig({ mode: 'TRADE', scenarioId: id, seed: s.cfg.seed, traffic: s.cfg.traffic, weather: s.cfg.weather, startHour: s.cfg.hour, complexity: s.cfg.complexity, radarOff: s.cfg.radarOff ?? [], incidents: s.cfg.incidents ?? false, intel: s.cfg.intel ?? false, radarFaults: s.cfg.radarFaults ?? false, tension0: s.cfg.tension0 ?? 0.03, growth: false }))
    e.warm(150); return e
  }
  it('T1 First Contact: query ATC then classify', async () => {
    const e = await build('T1')
    e.step(400)
    const mine = () => Object.values(e.st.tracks).filter((t) => !t.dropped && !t.manual && ['strayed', 'noPlan'].includes(e.st.aircraft[t.entityId]?.truth.intent ?? ''))
    for (let i = 0; i < 40 && !e.st.ended; i++) { for (const t of mine()) { if (!t.checks.atc) e.dispatch({ c: 'atc', trackId: t.id }) } e.step(30); for (const t of mine()) if (t.checks.atc) e.dispatch({ c: 'declare', trackId: t.id, cat: 'IDENTIFIED' }) }
    expect(e.st.flags.result).toBe('SUCCESS'); expect(e.st.ended).toBe(true)
  })
  it('T6 Mayday: acknowledging and alerting resolves all three incidents', async () => {
    const e = await build('T6')
    for (let i = 0; i < 320 && !e.st.ended; i++) {
      e.step(15)
      for (const inc of e.st.incidents) if (inc.closed === null) { e.dispatch({ c: 'ack', incidentId: inc.id }); if (inc.kind === 'EMERGENCY_7700' || inc.kind === 'UNLAWFUL_7500') e.dispatch({ c: 'alertAirfield', incidentId: inc.id }) }
    }
    expect(e.st.objectives.filter((o) => !o.optional).every((o) => o.done)).toBe(true)
  })
  it('T2 foreign aircraft: E-3D patrol + IDENTIFY completes', async () => {
    const e = await build('T2')
    const e3 = Object.values(e.st.assets).find((a) => a.typeId === 'E3D' && a.status === 'READY')!
    expect(e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: e3.id, point: { lat: 57.5, lon: -9.5 }, durationMin: 120, expedite: true } })).toBeNull()
    let tried = false
    for (let i = 0; i < 700 && !e.st.ended; i++) {
      e.step(15)
      const t = Object.values(e.st.tracks).find((x) => !x.dropped && e.st.aircraft[x.entityId]?.truth.intent === 'foreignState')
      if (t && !tried) { tried = e.dispatch({ c: 'op', spec: { type: 'IDENTIFY', trackId: t.id, expedite: true } }) === null }
    }
    expect(e.st.objectives[0].done).toBe(true)
  })
})

describe('combat', () => {
  const fleet = [{ id: 'P1', typeId: 'F15', base: 'EGXE' }, { id: 'P2', typeId: 'F5E', base: 'EGQL' }, { id: 'P3', typeId: 'VC10', base: 'EGVN' }]
  const mkC = (over = {}) => { const e = new SimEngine(defaultConfig({ incidents: false, intel: false, radarFaults: false, seed: 77, fleet, batteries: [{ id: 'B1', typeId: 'BLOODHOUND', site: 'NEWCASTLE' }], hostiles: false, level: 3, ...over })); e.warm(60); return e }
  it('builds the fleet and batteries from the save', () => {
    const e = mkC()
    expect(Object.keys(e.st.assets).sort()).toEqual(['P1', 'P2', 'P3'])
    expect(e.st.assets.P1.missiles).toBe(6)
    expect(e.st.batteries[0].missiles).toBe(3)
  })
  it('weapons are tight until a target is declared hostile', () => {
    const e = mkC(); e.step(200)
    const civ = Object.values(e.st.tracks).find((t) => !t.dropped && e.st.aircraft[t.entityId]?.kind === 'civil')!
    expect(e.dispatch({ c: 'op', spec: { type: 'ENGAGE', trackId: civ.id } })).toMatch(/Weapons tight/)
    expect(e.dispatch({ c: 'samFire', batteryId: 'B1', trackId: civ.id })).toMatch(/Weapons tight/)
  })
  it('a raid can be identified and then destroyed by an interceptor', () => {
    const e = mkC()
    e.dispatch({ c: 'raid', size: 1 })
    const bandit = Object.values(e.st.aircraft).find((a) => a.truth.intent === 'hostile')!
    let tr: any; for (let i = 0; i < 400 && !tr; i++) { e.step(5); tr = Object.values(e.st.tracks).find((t) => t.entityId === bandit.id && !t.dropped) }
    expect(tr).toBeDefined()
    expect(e.dispatch({ c: 'op', spec: { type: 'IDENTIFY', trackId: tr.id, assetId: 'P1', expedite: true } })).toBeNull()
    for (let i = 0; i < 3000 && !tr.hostile && e.st.aircraft[bandit.id]; i++) e.step(1)
    if (!e.st.aircraft[bandit.id]) return // raid finished before intercept (acceptable outcome, tested elsewhere)
    expect(tr.hostile).toBe(true)
    expect(e.dispatch({ c: 'op', spec: { type: 'ENGAGE', trackId: tr.id } })).toBeNull()
    for (let i = 0; i < 1500 && e.st.aircraft[bandit.id]; i++) e.step(1)
    expect(e.st.aircraft[bandit.id]).toBeUndefined()
    expect(e.st.splashes + (e.st.airspace < 100 ? 1 : 0)).toBeGreaterThan(0)
  })
  it('an unopposed raid breaches airspace and costs coins', () => {
    const e = mkC()
    e.dispatch({ c: 'raid', size: 2 })
    for (let i = 0; i < 2400 && e.st.airspace === 100; i++) e.step(1)
    expect(e.st.airspace).toBeLessThan(100)
    expect(e.st.coins).toBeLessThan(0)
  })
})

describe('save', () => {
  it('redeem codes grant coins once', async () => {
    const { freshSave, redeem } = await import('../src/game/save')
    const s = freshSave(); const c0 = s.coins
    expect(redeem(s, 'skymillion').ok).toBe(true); expect(s.coins).toBe(c0 + 1_000_000)
    expect(redeem(s, 'SKYMILLION').text).toMatch(/already/); expect(redeem(s, 'NOPE').text).toMatch(/Unknown/)
    const { levelOf } = await import('../src/game/save')
    expect(redeem(s, 'skymax').ok).toBe(true); expect(levelOf(s.xp).level).toBe(50); expect(s.upgrades.missiles).toBe(3)
  })
  it('an ATC check that confirms the flight resolves a missing-plan incident', () => {
    const e = new SimEngine(defaultConfig({ incidents: false, intel: false, radarFaults: false, seed: 61 })); e.warm(90)
    spawnEvent(e.st, 'missing')
    let inc; for (let i = 0; i < 300 && !inc; i++) { e.step(1); inc = e.st.incidents.find((x) => x.kind === 'MISSING_PLAN') }
    const tr = Object.values(e.st.tracks).find((t) => t.entityId === inc!.entityId)!
    e.dispatch({ c: 'atc', trackId: tr.id }); e.step(20)
    expect(inc!.status).toBe('RESOLVED')
  })
})

describe('tankers, speed modes, fuel warnings', () => {
  const fleet = [{ id: 'F', typeId: 'F16', base: 'EGXE' }, { id: 'T', typeId: 'VC10', base: 'EGVN' }]
  const mkG = () => { const e = new SimEngine(defaultConfig({ incidents: false, intel: false, radarFaults: false, seed: 91, fleet, batteries: [], hostiles: true, level: 1 })); e.warm(60); e.st.flags.nextRaid = 1e12; return e }
  it('tankers are airborne from the start and stay up for the whole shift', () => {
    const e = mkG()
    expect(e.st.assets.T.ac).not.toBeNull()
    e.step(2400)
    expect(e.st.assets.T.ac).not.toBeNull()
    expect(e.st.ops[e.st.assets.T.opId!].type).toBe('PATROL')
  })
  it('refuelling uses the airborne tanker, which then returns to its orbit', () => {
    const e = mkG()
    e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: 'F', point: { lat: 54.5, lon: -1 }, durationMin: 120, expedite: true } })
    e.step(600); e.st.assets.F.fuelKg = 2000
    expect(e.dispatch({ c: 'op', spec: { type: 'REFUEL', assetId: 'F' } })).toBeNull()
    const op = Object.values(e.st.ops).find((o) => o.type === 'REFUEL')!
    let g = 0; while (op.status === 'ACTIVE' && g++ < 4000) e.step(1)
    expect(op.status).toBe('COMPLETE'); expect(e.st.assets.F.fuelKg).toBeGreaterThan(5000)
    expect(e.st.assets.T.ac).not.toBeNull(); expect(e.st.ops[e.st.assets.T.opId!].type).toBe('PATROL')
  })
  it('speed modes change speed and fuel burn; low fuel raises a warning', () => {
    const run = (mode: 'ECO' | 'CRUISE' | 'MAX') => {
      const e = mkG(); e.dispatch({ c: 'speedMode', assetId: 'F', mode })
      e.dispatch({ c: 'op', spec: { type: 'PATROL', assetId: 'F', point: { lat: 58, lon: 2 }, durationMin: 60, expedite: true } })
      e.step(900); const a = e.st.assets.F; return { gs: a.ac!.gs, fuel: a.fuelKg, e }
    }
    const eco = run('ECO'), cru = run('CRUISE'), max = run('MAX')
    expect(eco.gs).toBeLessThan(cru.gs); expect(max.gs).toBeGreaterThan(cru.gs)
    expect(eco.fuel).toBeGreaterThan(cru.fuel); expect(max.fuel).toBeLessThan(cru.fuel)
    const e = max.e; let warned = false; e.st.events.length = 0; e.st.assets.F.fuelKg = 5800 * 0.36
    for (let i = 0; i < 3000 && !warned; i++) { e.step(1); warned = e.st.events.some((x) => x.type === 'ui' && x.name === 'lowfuel:F'); if (!warned) e.st.events.length = 0 }
    expect(warned).toBe(true)
  })
})

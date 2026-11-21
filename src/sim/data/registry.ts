import { hash32, Rng } from '../rng'
import type { Role } from '../types'

export interface Operator {
  code: string; name: string; rt: string; home: 'GB' | 'IE' | 'EU' | 'NA' | 'FAR'; reg: string; role: Role
  types: string[]; fleet: number; hubs: string[]; icaoBase: number
}
const O = (code: string, name: string, rt: string, home: Operator['home'], reg: string, role: Role, types: string[], fleet: number, hubs: string[], icaoBase: number): Operator =>
  ({ code, name, rt, home, reg, role, types, fleet, hubs, icaoBase })

export const OPERATORS: Operator[] = [
  O('BAW', 'British Airways', 'SPEEDBIRD', 'GB', 'G-', 'AIRLINER', ['B744', 'B772', 'B763', 'B752', 'B734', 'A320', 'A319', 'B735'], 40, ['EGLL', 'EGKK', 'EGCC', 'EGPH'], 0x400000),
  O('BMA', 'British Midland', 'MIDLAND', 'GB', 'G-', 'AIRLINER', ['B734', 'F100', 'B733', 'F70'], 12, ['EGLL', 'EGNX', 'EGPH'], 0x401000),
  O('VIR', 'Virgin Atlantic', 'VIRGIN', 'GB', 'G-', 'AIRLINER', ['B744', 'A343'], 10, ['EGLL', 'EGKK', 'EGCC'], 0x402000),
  O('EZY', 'easyJet', 'EASY', 'GB', 'G-', 'AIRLINER', ['B733'], 6, ['EGGW', 'EGPH'], 0x403000),
  O('MON', 'Monarch Airlines', 'MONARCH', 'GB', 'G-', 'AIRLINER', ['A320', 'A300', 'B752'].map((t) => (t === 'A300' ? 'A306' : t)), 10, ['EGGW', 'EGKK', 'EGCC'], 0x404000),
  O('BAL', 'Britannia Airways', 'BRITANNIA', 'GB', 'G-', 'AIRLINER', ['B752', 'B763'], 10, ['EGGW', 'EGCC', 'EGBB'], 0x405000),
  O('AUK', 'Air UK', 'BLACK KNIGHT', 'GB', 'G-', 'REGIONAL', ['F100', 'B462', 'F50'], 8, ['EGSS', 'EGPH', 'EGPD'], 0x406000),
  O('LOG', 'Loganair', 'LOGAN', 'GB', 'G-', 'REGIONAL', ['SF34', 'SH36'], 6, ['EGPF', 'EGPA', 'EGPB'], 0x407000),
  O('BRY', 'Brymon Airways', 'BRYMON', 'GB', 'G-', 'REGIONAL', ['DH8', 'AT72'], 5, ['EGGD', 'EGHD', 'EGHQ'], 0x408000),
  O('CFE', 'CityFlyer Express', 'FLYER', 'GB', 'G-', 'REGIONAL', ['AT72', 'B462'], 5, ['EGKK', 'EGLC'], 0x409000),
  O('EIN', 'Aer Lingus', 'SHAMROCK', 'IE', 'EI-', 'AIRLINER', ['A321', 'B734', 'A320', 'A343'], 14, ['EIDW', 'EINN', 'EICK'], 0x4CA000),
  O('RYR', 'Ryanair', 'RYANAIR', 'IE', 'EI-', 'AIRLINER', ['B732'], 12, ['EIDW', 'EGSS', 'EGGW'], 0x4CA100),
  O('KLM', 'KLM Royal Dutch Airlines', 'KLM', 'EU', 'PH-', 'AIRLINER', ['B744', 'B763', 'F100', 'MD11'], 12, ['EHAM'], 0x480000),
  O('AFR', 'Air France', 'AIRFRANS', 'EU', 'F-G', 'AIRLINER', ['A320', 'A343', 'B744', 'A321'], 12, ['LFPG', 'LFPO'], 0x380000),
  O('DLH', 'Lufthansa', 'LUFTHANSA', 'EU', 'D-A', 'AIRLINER', ['B744', 'A343', 'B734', 'A320'], 12, ['EDDF', 'EDDM'], 0x3C0000),
  O('SAS', 'Scandinavian Airlines', 'SCANDINAVIAN', 'EU', 'LN-', 'AIRLINER', ['MD82', 'B733', 'F50'], 8, ['EKCH', 'ENGM', 'ESSA'], 0x478000),
  O('IBE', 'Iberia', 'IBERIA', 'EU', 'EC-', 'AIRLINER', ['A320', 'B744', 'MD82'], 6, ['LEMD', 'LEBL'], 0x340000),
  O('SWR', 'Swissair', 'SWISSAIR', 'EU', 'HB-', 'AIRLINER', ['A320', 'A310', 'MD11'], 8, ['LSZH'], 0x4B0000),
  O('SAB', 'Sabena', 'SABENA', 'EU', 'OO-', 'AIRLINER', ['A310', 'B733', 'A320'], 6, ['EBBR'], 0x448000),
  O('AZA', 'Alitalia', 'ALITALIA', 'EU', 'I-', 'AIRLINER', ['MD82', 'A321', 'B744'], 5, ['LIRF'], 0x300000),
  O('AUA', 'Austrian Airlines', 'AUSTRIAN', 'EU', 'OE-', 'AIRLINER', ['A320', 'MD82'], 4, ['LOWW'], 0x440000),
  O('FIN', 'Finnair', 'FINNAIR', 'EU', 'OH-', 'AIRLINER', ['MD82', 'B757'.replace('B757', 'B752')], 4, ['EFHK'], 0x460000),
  O('ICE', 'Icelandair', 'ICEAIR', 'EU', 'TF-', 'AIRLINER', ['B752'], 4, ['BIKF'], 0x4CC000),
  O('TAP', 'TAP Air Portugal', 'AIRPORTUGAL', 'EU', 'CS-', 'AIRLINER', ['A310', 'A320'], 3, ['LPPT'], 0x490000),
  O('AAL', 'American Airlines', 'AMERICAN', 'NA', 'N', 'AIRLINER', ['B763', 'B752', 'MD11'], 8, ['KJFK', 'KORD', 'KBOS'], 0xA00000),
  O('DAL', 'Delta Air Lines', 'DELTA', 'NA', 'N', 'AIRLINER', ['B763', 'L101', 'B752'], 7, ['KATL', 'KJFK'], 0xA10000),
  O('UAL', 'United Airlines', 'UNITED', 'NA', 'N', 'AIRLINER', ['B744', 'B772', 'B763'], 8, ['KORD', 'KIAD', 'KLAX'], 0xA20000),
  O('COA', 'Continental Airlines', 'CONTINENTAL', 'NA', 'N', 'AIRLINER', ['B763', 'B752', 'DC10'], 5, ['KEWR'], 0xA30000),
  O('NWA', 'Northwest Airlines', 'NORTHWEST', 'NA', 'N', 'AIRLINER', ['B744', 'DC10'], 5, ['KBOS', 'KJFK'], 0xA40000),
  O('TWA', 'Trans World Airlines', 'TWA', 'NA', 'N', 'AIRLINER', ['B763', 'L101'], 4, ['KJFK'], 0xA50000),
  O('USA', 'US Airways', 'USAIR', 'NA', 'N', 'AIRLINER', ['B763', 'B752'], 4, ['KIAD', 'KBOS'], 0xA60000),
  O('ACA', 'Air Canada', 'AIR CANADA', 'NA', 'C-F', 'AIRLINER', ['A343', 'B763', 'A310'], 6, ['CYYZ', 'CYUL'], 0xC00000),
  O('CDN', 'Canadian Airlines', 'CANADIAN', 'NA', 'C-F', 'AIRLINER', ['A310', 'B763'], 3, ['CYYZ'], 0xC10000),
  O('UAE', 'Emirates', 'EMIRATES', 'FAR', 'A6-', 'AIRLINER', ['A310', 'A343'], 3, ['OMDB'], 0x896000),
  O('SIA', 'Singapore Airlines', 'SINGAPORE', 'FAR', '9V-', 'AIRLINER', ['B744'], 3, ['WSSS'], 0x760000),
  O('CPA', 'Cathay Pacific', 'CATHAY', 'FAR', 'B-H', 'AIRLINER', ['B744'], 3, ['VHHH'], 0x780000),
  O('AIC', 'Air India', 'AIRINDIA', 'FAR', 'VT-', 'AIRLINER', ['B744', 'A310'], 3, ['VIDP'], 0x800000),
  O('THY', 'Turkish Airlines', 'TURKAIR', 'FAR', 'TC-', 'AIRLINER', ['A310', 'A320'], 3, ['LTBA'], 0x4B8000),
  O('DHK', 'DHL Air', 'WORLD EXPRESS', 'GB', 'G-', 'CARGO', ['B722', 'B752'], 6, ['EGNX', 'EGLL'], 0x40A000),
  O('TNT', 'TNT Airways', 'TRACKER', 'EU', 'OO-', 'CARGO', ['B462', 'B722'], 5, ['EGNX', 'EBBR'], 0x44A000),
  O('FDX', 'Federal Express', 'FEDEX', 'NA', 'N', 'CARGO', ['DC10', 'MD11', 'B722'], 6, ['KJFK', 'EGSS'], 0xA70000),
  O('UPS', 'United Parcel Service', 'UPS', 'NA', 'N', 'CARGO', ['B742', 'B722'], 5, ['KJFK', 'EGNX'], 0xA80000),
  O('SEC', 'Securicor Omega', 'SECURICOR', 'GB', 'G-', 'CARGO', ['B733', 'B462'], 3, ['EGNX', 'EGGW'], 0x40B000),
]

export type Country = Operator['home']
export interface AircraftRecord {
  reg: string; icao24: string; typeId: string; operator: string; opCode: string; role: Role; msn: number; built: number; owner: string; homeBase: string; seq: number
}
const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function genReg(prefix: string, r: Rng, used: Set<string>): string {
  for (;;) {
    let reg: string
    if (prefix === 'N') reg = 'N' + r.int(1, 999) + (r.chance(0.7) ? L[r.int(0, 25)] + (r.chance(0.5) ? L[r.int(0, 25)] : '') : '')
    else if (prefix === 'G-') reg = r.chance(0.5) ? `G-B${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}` : `G-${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'D-A') reg = `D-A${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'F-G') reg = `F-G${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'C-F') reg = `C-F${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'B-H') reg = `B-H${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === '9V-') reg = `9V-S${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'A6-') reg = `A6-E${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else if (prefix === 'I-') reg = `I-${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}${L[r.int(0, 25)]}`
    else reg = prefix + L[r.int(0, 25)] + L[r.int(0, 25)] + L[r.int(0, 25)]
    if (!used.has(reg)) { used.add(reg); return reg }
  }
}
const hex6 = (n: number) => n.toString(16).toUpperCase().padStart(6, '0')

/** Deterministically builds the national aircraft register (independent of the sim RNG). */
function build(): AircraftRecord[] {
  const r = new Rng(hash32('SKY-DEFENDER-1998-REGISTER'))
  const used = new Set<string>(), usedHex = new Set<string>()
  const out: AircraftRecord[] = []
  const hexFor = (base: number) => { for (;;) { const h = hex6(base + r.int(0, 0x0fff)); if (!usedHex.has(h)) { usedHex.add(h); return h } } }
  for (const op of OPERATORS) {
    for (let i = 0; i < op.fleet; i++) {
      const typeId = op.types[i % op.types.length]
      out.push({ reg: genReg(op.reg, r, used), icao24: hexFor(op.icaoBase), typeId, operator: op.name, opCode: op.code, role: op.role, msn: r.int(20000, 29999), built: r.int(1979, 1998), owner: op.name, homeBase: op.hubs[i % op.hubs.length], seq: out.length })
    }
  }
  const civ = (n: number, role: Role, types: string[], regp: string[], opName: string[], hubs: string[], base: number, prefix: string) => {
    for (let i = 0; i < n; i++) {
      const rp = r.pick(regp)
      out.push({ reg: genReg(rp, r, used), icao24: hexFor(rp === 'N' ? 0xA90000 : rp === 'EI-' ? 0x4CA200 : rp === 'D-A' ? 0x3D0000 : rp === 'F-G' ? 0x390000 : base), typeId: r.pick(types), operator: r.pick(opName), opCode: prefix, role, msn: r.int(1000, 99999), built: r.int(1965, 1998), owner: r.pick(opName), homeBase: r.pick(hubs), seq: out.length })
    }
  }
  civ(60, 'GA', ['C172', 'PA28', 'C182', 'PA34', 'BE58'], ['G-', 'G-', 'G-', 'G-', 'EI-', 'N', 'D-A'], ['Private owner', 'Flying club', 'Aero club', 'Flight training school'], ['EGBJ', 'EGTK', 'EGLF', 'EGKB', 'EGSC', 'EGBE', 'EGTC', 'EGBP', 'EGMC', 'EGHD', 'EGPN', 'EGNH', 'EIME'], 0x43A000, 'GA')
  civ(30, 'BIZJET', ['C550', 'LJ35', 'GLF4', 'FA50', 'H25B', 'C560', 'BE20'], ['G-', 'G-', 'N', 'D-A', 'F-G', 'EI-'], ['Corporate operator', 'Executive charter', 'Private owner'], ['EGLF', 'EGKB', 'EGGW', 'EGTC', 'EGWU'.replace('EGWU', 'EGLF')], 0x43B000, 'BIZ')
  civ(20, 'OFFSHORE', ['AS32', 'S61'], ['G-'], ['Bristow Helicopters', 'British International Helicopters', 'Bond Helicopters'], ['EGPD'], 0x43C000, 'OFF')
  civ(10, 'POLICE', ['B105', 'AS55', 'MD90'], ['G-'], ['County police air support', 'Metropolitan Police'], ['EGTC', 'EGKB', 'EGBJ'], 0x43D000, 'POL')
  civ(8, 'AMBULANCE', ['BK17', 'B105', 'MD90'], ['G-'], ['Air ambulance charity', 'Helimed'], ['EGBJ', 'EGTC', 'EGNM', 'EGNH'], 0x43E000, 'AMB')
  civ(6, 'COASTGUARD', ['S61'], ['G-'], ['HM Coastguard (Bristow)'], ['EGPB', 'EGHQ', 'EGAE'.replace('EGAE', 'EGPD')], 0x43F000, 'CG')
  return out
}
export const REGISTRY: AircraftRecord[] = build()
export const REG_BY_REG: Record<string, AircraftRecord> = Object.fromEntries(REGISTRY.map((a) => [a.reg, a]))
export const OP_BY_CODE: Record<string, Operator> = Object.fromEntries(OPERATORS.map((o) => [o.code, o]))
/** Look up by registration, ICAO24 hex, or callsign fragment. */
export function searchRegistry(q: string, limit = 60): AircraftRecord[] {
  const s = q.trim().toUpperCase(); if (!s) return REGISTRY.slice(0, limit)
  return REGISTRY.filter((r) => r.reg.includes(s) || r.icao24.includes(s) || r.operator.toUpperCase().includes(s) || r.typeId.includes(s) || r.opCode === s).slice(0, limit)
}

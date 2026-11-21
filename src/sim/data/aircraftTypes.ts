import type { Role } from '../types'
export interface CivType { id: string; name: string; cat: 'JET' | 'TURBOPROP' | 'PISTON' | 'HELI'; cruiseKt: number; maxFL: number; climbFpm: number; rcs: number; rangeNm: number; emitter: 'WXR' | 'NAV' | 'NONE'; turn: number }
const T = (id: string, name: string, cat: CivType['cat'], cruiseKt: number, maxFL: number, climbFpm: number, rcs: number, rangeNm: number, emitter: CivType['emitter'] = 'WXR', turn = 3): CivType =>
  ({ id, name, cat, cruiseKt, maxFL, climbFpm, rcs, rangeNm, emitter, turn })
export const CIV_TYPES: Record<string, CivType> = Object.fromEntries([
  T('B744', 'Boeing 747-400', 'JET', 490, 410, 2000, 2.2, 7500), T('B742', 'Boeing 747-200', 'JET', 480, 390, 1800, 2.1, 6500),
  T('B772', 'Boeing 777-200', 'JET', 490, 430, 2400, 1.8, 5500), T('B763', 'Boeing 767-300', 'JET', 450, 410, 2200, 1.5, 5000),
  T('B752', 'Boeing 757-200', 'JET', 450, 420, 2800, 1.3, 3800), T('B733', 'Boeing 737-300', 'JET', 430, 370, 2500, 1.1, 2200),
  T('B734', 'Boeing 737-400', 'JET', 430, 370, 2500, 1.1, 2400), T('B735', 'Boeing 737-500', 'JET', 430, 370, 2600, 1.0, 2200),
  T('B732', 'Boeing 737-200', 'JET', 420, 350, 2400, 1.0, 2000), T('B722', 'Boeing 727-200F', 'JET', 440, 350, 2300, 1.2, 2200),
  T('A320', 'Airbus A320-200', 'JET', 440, 390, 2600, 1.1, 2800), T('A319', 'Airbus A319-100', 'JET', 440, 390, 2700, 1.0, 2800),
  T('A321', 'Airbus A321-100', 'JET', 440, 390, 2400, 1.2, 2300), T('A343', 'Airbus A340-300', 'JET', 480, 410, 2000, 1.9, 7000),
  T('A310', 'Airbus A310-300', 'JET', 450, 410, 2200, 1.5, 4300), T('A306', 'Airbus A300-600', 'JET', 440, 390, 2100, 1.6, 3500),
  T('MD11', 'McDonnell Douglas MD-11', 'JET', 480, 430, 2100, 1.9, 6800), T('MD82', 'McDonnell Douglas MD-82', 'JET', 430, 370, 2300, 1.1, 2000),
  T('DC10', 'McDonnell Douglas DC-10-30', 'JET', 470, 390, 2000, 1.8, 5200), T('L101', 'Lockheed L-1011 TriStar', 'JET', 470, 400, 2000, 1.8, 4000),
  T('F100', 'Fokker 100', 'JET', 400, 350, 2500, 0.9, 1500), T('F70', 'Fokker 70', 'JET', 400, 350, 2500, 0.8, 1500), T('F50', 'Fokker 50', 'TURBOPROP', 260, 250, 1800, 0.7, 1000),
  T('B462', 'BAe 146-200', 'JET', 390, 350, 2200, 0.9, 1200), T('AT72', 'ATR 72', 'TURBOPROP', 275, 250, 1700, 0.6, 800), T('AT43', 'ATR 42', 'TURBOPROP', 260, 250, 1700, 0.6, 700),
  T('DH8', 'De Havilland Dash 8-300', 'TURBOPROP', 265, 250, 1800, 0.6, 800), T('SF34', 'Saab 340', 'TURBOPROP', 250, 250, 1800, 0.5, 750),
  T('SH36', 'Shorts 360', 'TURBOPROP', 190, 100, 1100, 0.5, 400), T('JS31', 'BAe Jetstream 31', 'TURBOPROP', 230, 250, 1800, 0.4, 600), T('JS41', 'BAe Jetstream 41', 'TURBOPROP', 270, 250, 2200, 0.5, 700),
  T('E120', 'Embraer EMB-120 Brasilia', 'TURBOPROP', 270, 250, 2000, 0.5, 700), T('ATP', 'BAe ATP', 'TURBOPROP', 260, 250, 1700, 0.6, 700), T('CRJ1', 'Canadair CRJ-100', 'JET', 440, 410, 3000, 0.6, 1800),
  T('C172', 'Cessna 172', 'PISTON', 105, 130, 700, 0.1, 500, 'NONE', 5), T('PA28', 'Piper PA-28 Cherokee', 'PISTON', 110, 130, 650, 0.1, 500, 'NONE', 5),
  T('C182', 'Cessna 182', 'PISTON', 125, 140, 900, 0.12, 600, 'NONE', 5), T('PA34', 'Piper PA-34 Seneca', 'PISTON', 160, 200, 1200, 0.15, 700, 'NAV', 4),
  T('BE58', 'Beech 58 Baron', 'PISTON', 185, 200, 1500, 0.15, 800, 'NAV', 4), T('BE20', 'Beech King Air 200', 'TURBOPROP', 270, 250, 2200, 0.3, 1200, 'WXR', 4),
  T('C550', 'Cessna Citation II', 'JET', 380, 430, 3000, 0.3, 1500, 'WXR', 4), T('LJ35', 'Learjet 35', 'JET', 440, 450, 4000, 0.3, 2000, 'WXR', 4),
  T('GLF4', 'Gulfstream IV', 'JET', 480, 450, 3500, 0.5, 4000, 'WXR', 4), T('FA50', 'Dassault Falcon 50', 'JET', 450, 490, 3000, 0.4, 3000, 'WXR', 4),
  T('H25B', 'BAe 125-800', 'JET', 440, 410, 3000, 0.4, 2500, 'WXR', 4), T('C560', 'Cessna Citation V', 'JET', 400, 450, 3200, 0.3, 1800, 'WXR', 4),
  T('AS32', 'Eurocopter AS332L Super Puma', 'HELI', 140, 60, 1200, 0.5, 400, 'WXR', 4), T('S61', 'Sikorsky S-61N', 'HELI', 120, 40, 1000, 0.5, 350, 'WXR', 4),
  T('B412', 'Bell 412', 'HELI', 120, 60, 1200, 0.3, 350, 'NAV', 5), T('B105', 'MBB Bo 105', 'HELI', 115, 40, 1500, 0.2, 300, 'NONE', 6),
  T('BK17', 'MBB/Kawasaki BK 117', 'HELI', 130, 60, 1500, 0.25, 300, 'NONE', 6), T('MD90', 'MD Explorer', 'HELI', 130, 40, 1500, 0.2, 300, 'NONE', 6),
  T('AS55', 'Eurocopter AS355 Twin Squirrel', 'HELI', 120, 40, 1300, 0.2, 300, 'NONE', 6),
  // non-civil / phenomena
  T('FSTA', 'Foreign State Aircraft (large turboprop)', 'TURBOPROP', 410, 390, 1500, 2.2, 6000, 'NONE', 2),
  T('FSTB', 'Foreign State Aircraft (maritime patrol)', 'JET', 380, 330, 1800, 1.6, 4000, 'NONE', 3),
  T('BALN', 'Free balloon', 'PISTON', 22, 400, 200, 0.05, 99999, 'NONE', 1), T('FLOK', 'Bird flock', 'PISTON', 28, 8, 300, 0.04, 99999, 'NONE', 8),
  T('ANOM', 'Anomalous propagation return', 'PISTON', 40, 25, 500, 0.5, 99999, 'NONE', 3),
].map((t) => [t.id, t]))

export const ROLE_SQUAWK: Partial<Record<Role, string>> = { GA: '7000' }

export interface AssetType {
  id: string; name: string; short: string; role: 'FIGHTER' | 'AEW' | 'ELINT' | 'TANKER' | 'TRANSPORT' | 'HELO'
  cruiseKt: number; maxKt: number; ceiling: number; fuelCap: number; burnCruise: number; burnMax: number
  climbFpm: number; turn: number; rcs: number; radar: number; offload: number; cargo: number
  svcHrs: number; maintHrs: number; runway: number; emitter: 'MIL' | 'WXR'; patrolAlt: number
}
export const ASSET_TYPES: Record<string, AssetType> = {
  F3: { id: 'F3', name: 'Panavia Tornado F3', short: 'TORNADO F3', role: 'FIGHTER', cruiseKt: 450, maxKt: 650, ceiling: 50000, fuelCap: 7500, burnCruise: 2800, burnMax: 7000, climbFpm: 20000, turn: 4, rcs: 0.5, radar: 70, offload: 0, cargo: 0, svcHrs: 40, maintHrs: 1.5, runway: 7000, emitter: 'MIL', patrolAlt: 25000 },
  E3D: { id: 'E3D', name: 'Boeing E-3D Sentry AEW1', short: 'E-3D SENTRY', role: 'AEW', cruiseKt: 380, maxKt: 480, ceiling: 40000, fuelCap: 90000, burnCruise: 8200, burnMax: 11000, climbFpm: 2000, turn: 2.5, rcs: 2.0, radar: 220, offload: 0, cargo: 0, svcHrs: 90, maintHrs: 4, runway: 8000, emitter: 'MIL', patrolAlt: 29000 },
  R1: { id: 'R1', name: 'Hawker Siddeley Nimrod R1', short: 'NIMROD R1', role: 'ELINT', cruiseKt: 400, maxKt: 490, ceiling: 40000, fuelCap: 48000, burnCruise: 5500, burnMax: 8000, climbFpm: 3000, turn: 3, rcs: 1.2, radar: 0, offload: 0, cargo: 0, svcHrs: 70, maintHrs: 4, runway: 7000, emitter: 'MIL', patrolAlt: 27000 },
  VC10: { id: 'VC10', name: 'Vickers VC10 K3 tanker', short: 'VC10 K3', role: 'TANKER', cruiseKt: 430, maxKt: 500, ceiling: 40000, fuelCap: 80000, burnCruise: 6500, burnMax: 9000, climbFpm: 2500, turn: 2.5, rcs: 1.8, radar: 0, offload: 45000, cargo: 0, svcHrs: 80, maintHrs: 4, runway: 8000, emitter: 'MIL', patrolAlt: 26000 },
  L1011: { id: 'L1011', name: 'Lockheed TriStar K1 tanker', short: 'TRISTAR K1', role: 'TANKER', cruiseKt: 460, maxKt: 520, ceiling: 40000, fuelCap: 110000, burnCruise: 7800, burnMax: 10000, climbFpm: 2500, turn: 2.5, rcs: 2.0, radar: 0, offload: 60000, cargo: 0, svcHrs: 80, maintHrs: 4, runway: 8000, emitter: 'MIL', patrolAlt: 27000 },
  C130: { id: 'C130', name: 'Lockheed Hercules C-130K', short: 'HERCULES C1', role: 'TRANSPORT', cruiseKt: 300, maxKt: 340, ceiling: 28000, fuelCap: 20000, burnCruise: 2700, burnMax: 3200, climbFpm: 1500, turn: 3, rcs: 1.0, radar: 0, offload: 0, cargo: 20000, svcHrs: 60, maintHrs: 3, runway: 4500, emitter: 'MIL', patrolAlt: 18000 },
  CH47: { id: 'CH47', name: 'Boeing Chinook HC2', short: 'CHINOOK HC2', role: 'HELO', cruiseKt: 130, maxKt: 160, ceiling: 10000, fuelCap: 3700, burnCruise: 1250, burnMax: 1500, climbFpm: 1500, turn: 6, rcs: 0.4, radar: 0, offload: 0, cargo: 6000, svcHrs: 30, maintHrs: 2, runway: 300, emitter: 'MIL', patrolAlt: 1500 },
}
export interface BaseSeed { icao: string; fuel: number; cap: number; spares: number; bowsers: number; engineers: number; fleet: [string, number, string][] }
export const BASE_SEEDS: BaseSeed[] = [
  { icao: 'EGXE', fuel: 140000, cap: 260000, spares: 40, bowsers: 2, engineers: 3, fleet: [['F3', 6, 'ZE']] },
  { icao: 'EGQL', fuel: 150000, cap: 260000, spares: 40, bowsers: 2, engineers: 3, fleet: [['F3', 6, 'ZG']] },
  { icao: 'EGXC', fuel: 130000, cap: 240000, spares: 36, bowsers: 2, engineers: 3, fleet: [['F3', 5, 'ZH']] },
  { icao: 'EGQS', fuel: 70000, cap: 160000, spares: 18, bowsers: 1, engineers: 2, fleet: [['F3', 2, 'ZE']] },
  { icao: 'EGXW', fuel: 260000, cap: 420000, spares: 30, bowsers: 3, engineers: 3, fleet: [['E3D', 3, 'ZH'], ['R1', 2, 'XW']] },
  { icao: 'EGVN', fuel: 420000, cap: 700000, spares: 30, bowsers: 4, engineers: 4, fleet: [['VC10', 3, 'ZA'], ['L1011', 2, 'ZD']] },
  { icao: 'EGUN', fuel: 150000, cap: 300000, spares: 14, bowsers: 2, engineers: 2, fleet: [['VC10', 1, 'ZB']] },
  { icao: 'EGDL', fuel: 500000, cap: 800000, spares: 120, bowsers: 4, engineers: 4, fleet: [['C130', 6, 'XV']] },
  { icao: 'EGVO', fuel: 60000, cap: 140000, spares: 24, bowsers: 2, engineers: 2, fleet: [['CH47', 4, 'ZA']] },
  { icao: 'EGAA', fuel: 40000, cap: 90000, spares: 12, bowsers: 1, engineers: 1, fleet: [['CH47', 2, 'ZH']] },
]

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
  T('BFJ', 'Bandit fast jet', 'JET', 480, 450, 15000, 0.8, 1500, 'NONE', 4), T('BBM', 'Bandit bomber', 'JET', 420, 420, 3000, 2.2, 5000, 'NONE', 2.5), T('BDR', 'Bandit drone', 'TURBOPROP', 220, 250, 1500, 0.12, 2000, 'NONE', 3),
].map((t) => [t.id, t]))

export const ROLE_SQUAWK: Partial<Record<Role, string>> = { GA: '7000' }

export interface AssetType {
  id: string; name: string; short: string; role: 'FIGHTER' | 'AEW' | 'ELINT' | 'TANKER' | 'TRANSPORT' | 'HELO'
  cruiseKt: number; maxKt: number; ceiling: number; fuelCap: number; burnCruise: number; burnMax: number
  climbFpm: number; turn: number; rcs: number; radar: number; offload: number; cargo: number
  svcHrs: number; maintHrs: number; runway: number; emitter: 'MIL' | 'WXR'; patrolAlt: number
  missiles: number; mRange: number; pk: number
}
type AT = Omit<AssetType, 'svcHrs' | 'maintHrs' | 'runway' | 'emitter' | 'offload' | 'cargo' | 'missiles' | 'mRange' | 'pk'> & Partial<AssetType>
const mk = (t: AT): AssetType => ({ svcHrs: 40, maintHrs: 1.5, runway: 7000, emitter: 'MIL', offload: 0, cargo: 0, missiles: 0, mRange: 0, pk: 0, ...t })
const FTR = (id: string, name: string, short: string, cruiseKt: number, maxKt: number, fuelCap: number, burnCruise: number, radar: number, missiles: number, mRange: number, pk: number, climbFpm = 18000, turn = 4.5) =>
  mk({ id, name, short, role: 'FIGHTER', cruiseKt, maxKt, ceiling: 50000, fuelCap, burnCruise, burnMax: burnCruise * 2.4, climbFpm, turn, rcs: 0.5, radar, patrolAlt: 25000, missiles, mRange, pk })
export const ASSET_TYPES: Record<string, AssetType> = {
  HAWK: FTR('HAWK', 'BAe Hawk T1A', 'HAWK T1A', 400, 540, 2500, 1100, 25, 2, 5, 0.55, 9000, 5),
  F5E: FTR('F5E', 'Northrop F-5E Tiger II', 'F-5E TIGER II', 450, 600, 3600, 1600, 30, 2, 6, 0.6, 15000, 5),
  L159: FTR('L159', 'Aero L-159 ALCA', 'L-159 ALCA', 430, 560, 3100, 1300, 40, 2, 8, 0.65, 12000, 5),
  F3: FTR('F3', 'Panavia Tornado F3', 'TORNADO F3', 450, 650, 7500, 2800, 70, 4, 20, 0.7, 20000, 4),
  F16: FTR('F16', 'General Dynamics F-16C', 'F-16C FALCON', 470, 680, 5800, 2400, 60, 4, 15, 0.72, 30000, 5.5),
  M2K: FTR('M2K', 'Dassault Mirage 2000-5', 'MIRAGE 2000-5', 480, 700, 6200, 2600, 70, 4, 20, 0.75, 30000, 5.5),
  F15: FTR('F15', 'McDonnell Douglas F-15C Eagle', 'F-15C EAGLE', 490, 720, 9000, 3200, 90, 6, 25, 0.8, 35000, 5),
  EF: FTR('EF', 'Eurofighter EF2000 (development)', 'EF2000', 500, 760, 8000, 2700, 100, 6, 30, 0.85, 40000, 6),
  E3D: mk({ id: 'E3D', name: 'Boeing E-3D Sentry AEW1', short: 'E-3D SENTRY', role: 'AEW', cruiseKt: 380, maxKt: 480, ceiling: 40000, fuelCap: 90000, burnCruise: 8200, burnMax: 11000, climbFpm: 2000, turn: 2.5, rcs: 2.0, radar: 220, svcHrs: 90, maintHrs: 4, runway: 8000, patrolAlt: 29000 }),
  R1: mk({ id: 'R1', name: 'Hawker Siddeley Nimrod R1', short: 'NIMROD R1', role: 'ELINT', cruiseKt: 400, maxKt: 490, ceiling: 40000, fuelCap: 48000, burnCruise: 5500, burnMax: 8000, climbFpm: 3000, turn: 3, rcs: 1.2, radar: 0, svcHrs: 70, maintHrs: 4, patrolAlt: 27000 }),
  VC10: mk({ id: 'VC10', name: 'Vickers VC10 K3 tanker', short: 'VC10 K3', role: 'TANKER', cruiseKt: 430, maxKt: 500, ceiling: 40000, fuelCap: 80000, burnCruise: 6500, burnMax: 9000, climbFpm: 2500, turn: 2.5, rcs: 1.8, radar: 0, offload: 45000, svcHrs: 80, maintHrs: 4, runway: 8000, patrolAlt: 26000 }),
  KC135: mk({ id: 'KC135', name: 'Boeing KC-135R Stratotanker', short: 'KC-135R', role: 'TANKER', cruiseKt: 440, maxKt: 510, ceiling: 40000, fuelCap: 90000, burnCruise: 6800, burnMax: 9200, climbFpm: 2600, turn: 2.5, rcs: 1.9, radar: 0, offload: 55000, svcHrs: 80, maintHrs: 4, runway: 8000, patrolAlt: 26000 }),
  L1011: mk({ id: 'L1011', name: 'Lockheed TriStar K1 tanker', short: 'TRISTAR K1', role: 'TANKER', cruiseKt: 460, maxKt: 520, ceiling: 40000, fuelCap: 110000, burnCruise: 7800, burnMax: 10000, climbFpm: 2500, turn: 2.5, rcs: 2.0, radar: 0, offload: 60000, svcHrs: 80, maintHrs: 4, runway: 8000, patrolAlt: 27000 }),
  C130: mk({ id: 'C130', name: 'Lockheed Hercules C-130K', short: 'HERCULES C1', role: 'TRANSPORT', cruiseKt: 300, maxKt: 340, ceiling: 28000, fuelCap: 20000, burnCruise: 2700, burnMax: 3200, climbFpm: 1500, turn: 3, rcs: 1.0, radar: 0, cargo: 20000, svcHrs: 60, maintHrs: 3, runway: 4500, patrolAlt: 18000 }),
  CH47: mk({ id: 'CH47', name: 'Boeing Chinook HC2', short: 'CHINOOK HC2', role: 'HELO', cruiseKt: 130, maxKt: 160, ceiling: 10000, fuelCap: 3700, burnCruise: 1250, burnMax: 1500, climbFpm: 1500, turn: 6, rcs: 0.4, radar: 0, cargo: 6000, svcHrs: 30, maintHrs: 2, runway: 300, patrolAlt: 1500 }),
}
export interface BatteryType { id: string; name: string; short: string; range: number; missiles: number; reloadSec: number; pk: number }
export const BATTERY_TYPES: Record<string, BatteryType> = {
  STARSTREAK: { id: 'STARSTREAK', name: 'Starstreak HVM troop', short: 'STARSTREAK', range: 6, missiles: 8, reloadSec: 20, pk: 0.8 },
  RAPIER: { id: 'RAPIER', name: 'Rapier FSC battery', short: 'RAPIER', range: 12, missiles: 6, reloadSec: 45, pk: 0.7 },
  BLOODHOUND: { id: 'BLOODHOUND', name: 'Bloodhound Mk2 section', short: 'BLOODHOUND', range: 45, missiles: 3, reloadSec: 120, pk: 0.65 },
}
export interface Site { id: string; name: string; lat: number; lon: number }
export const SAM_SITES: Site[] = [
  { id: 'LONDON', name: 'London', lat: 51.55, lon: -0.15 }, { id: 'MANCHESTER', name: 'Manchester', lat: 53.45, lon: -2.25 },
  { id: 'BIRMINGHAM', name: 'Birmingham', lat: 52.48, lon: -1.9 }, { id: 'EDINBURGH', name: 'Edinburgh', lat: 55.95, lon: -3.2 },
  { id: 'GLASGOW', name: 'Glasgow', lat: 55.86, lon: -4.25 }, { id: 'BELFAST', name: 'Belfast', lat: 54.6, lon: -5.93 },
  { id: 'NEWCASTLE', name: 'Newcastle', lat: 54.98, lon: -1.6 }, { id: 'ABERDEEN', name: 'Aberdeen', lat: 57.15, lon: -2.1 },
  { id: 'LEEMING', name: 'RAF Leeming', lat: 54.29, lon: -1.54 }, { id: 'LEUCHARS', name: 'RAF Leuchars', lat: 56.37, lon: -2.87 },
  { id: 'CONINGSBY', name: 'RAF Coningsby', lat: 53.09, lon: -0.17 }, { id: 'LOSSIEMOUTH', name: 'RAF Lossiemouth', lat: 57.7, lon: -3.34 },
  { id: 'BRISTOL', name: 'Bristol', lat: 51.45, lon: -2.58 }, { id: 'NORWICH', name: 'Norwich', lat: 52.63, lon: 1.3 },
]
export const SITE_MAP: Record<string, Site> = Object.fromEntries(SAM_SITES.map((s) => [s.id, s]))
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

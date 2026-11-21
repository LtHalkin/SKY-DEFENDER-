import { ASSET_TYPES, BATTERY_TYPES, GROUND_RADARS } from '../sim/data/aircraftTypes'

export type ItemKind = 'JET' | 'SUPPORT' | 'SAM' | 'RADAR' | 'UPGRADE'
export interface Item { id: string; kind: ItemKind; name: string; price: number; level: number; blurb: string }
const jet = (id: string, price: number, level: number, blurb: string): Item => ({ id, kind: 'JET', name: ASSET_TYPES[id].name, price, level, blurb })
const sup = (id: string, price: number, level: number, blurb: string): Item => ({ id, kind: 'SUPPORT', name: ASSET_TYPES[id].name, price, level, blurb })
const sam = (id: string, price: number, level: number, blurb: string): Item => ({ id, kind: 'SAM', name: BATTERY_TYPES[id].name, price, level, blurb })
const rdr = (id: string, price: number, level: number): Item => ({ id, kind: 'RADAR', name: GROUND_RADARS[id].name, price, level, blurb: GROUND_RADARS[id].blurb })
export const ITEMS: Item[] = [
  jet('HAWK', 500, 1, 'Cheap point-defence trainer. Slow, short-legged, two short-range missiles.'),
  jet('F5E', 900, 1, 'Nimble light fighter. Good for quick looks close to home.'),
  jet('L159', 1800, 2, 'Light combat jet with a better radar and longer missiles.'),
  jet('F3', 3000, 3, 'The RAF interceptor. Long range, long radar, four long-range missiles.'),
  jet('F16', 4500, 4, 'Fast-climbing all-rounder with four missiles.'),
  jet('M2K', 6000, 6, 'High-speed interceptor with a strong radar.'),
  jet('F15', 9000, 8, 'Air superiority heavyweight: six missiles and huge endurance.'),
  jet('EF', 15000, 10, 'Development-batch Eurofighter. The fastest and deadliest jet you can own.'),
  sup('VC10', 1500, 1, 'Tanker. Keeps your fighters on station longer.'),
  sup('KC135', 2500, 3, 'Bigger tanker with more fuel to give.'),
  sup('L1011', 3500, 5, 'Heavy tanker: the most transferable fuel.'),
  sup('E3D', 5000, 4, 'Airborne radar. Fly it into gaps to see low and far.'),
  sam('STARSTREAK', 700, 1, 'Very short range (6 NM) but fast reloads and eight missiles.'),
  sam('RAPIER', 1500, 2, 'Short-range battery (12 NM), six missiles.'),
  sam('BLOODHOUND', 4000, 5, 'Long-range site (45 NM). Three missiles, slow reload.'),
  rdr('GAPFILLER', 1800, 2), rdr('MOBILE', 2500, 3), rdr('LONGRANGE', 6000, 6),
]
export interface Upgrade { id: string; name: string; blurb: string; prices: number[]; level: number }
export const UPGRADES: Upgrade[] = [
  { id: 'radar', name: 'RADAR RANGE', blurb: '+10% range for every ground station per level.', prices: [800, 1600, 3200], level: 2 },
  { id: 'scramble', name: 'SCRAMBLE SPEED', blurb: 'Jets get airborne 25% faster per level.', prices: [600, 1200, 2400], level: 1 },
  { id: 'missiles', name: 'EXTRA MISSILE', blurb: '+1 missile on every fighter per level.', prices: [1000, 2000, 4000], level: 3 },
  { id: 'samReload', name: 'SAM RELOAD', blurb: 'Batteries reload 20% faster per level.', prices: [700, 1400, 2800], level: 3 },
  { id: 'samMag', name: 'SAM MAGAZINES', blurb: '+2 missiles in every battery per level.', prices: [900, 1800, 3600], level: 3 },
  { id: 'turnaround', name: 'FAST TURNAROUND', blurb: 'Jets refuel and rearm 30% faster per level, and every base gets an extra fuel bowser.', prices: [800, 1600, 3200], level: 2 },
  { id: 'hardened', name: 'HARDENED SITES', blurb: 'Hostiles that get through do 25% less damage per level.', prices: [1500, 3000, 6000], level: 4 },
  { id: 'capStart', name: 'CAP AT START', blurb: 'Your best fighter (two at level 2) starts every shift already airborne on patrol.', prices: [2500, 5000], level: 3 },
]
export const ITEM_MAP: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
export const BASES: { icao: string; name: string }[] = [
  { icao: 'EGQS', name: 'RAF Lossiemouth' }, { icao: 'EGQL', name: 'RAF Leuchars' }, { icao: 'EGXE', name: 'RAF Leeming' }, { icao: 'EGXC', name: 'RAF Coningsby' },
  { icao: 'EGXW', name: 'RAF Waddington' }, { icao: 'EGUN', name: 'RAF Mildenhall' }, { icao: 'EGVN', name: 'RAF Brize Norton' }, { icao: 'EGDL', name: 'RAF Lyneham' },
  { icao: 'EGVO', name: 'RAF Odiham' }, { icao: 'EGAA', name: 'Belfast Aldergrove' },
]

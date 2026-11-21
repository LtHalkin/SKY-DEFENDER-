import type { LatLon } from '../geo'
export interface Fix { id: string; lat: number; lon: number; gate?: boolean; offshore?: boolean }
const F = (id: string, lat: number, lon: number, gate = false, offshore = false): Fix => ({ id, lat, lon, gate, offshore })

export const FIXES: Fix[] = [
  // Oceanic entry/exit gates (west)
  F('AMASO', 57.0, -27, true), F('NEBIN', 54.5, -27, true), F('LOGSU', 52.0, -27, true), F('KOGAD', 49.5, -27, true),
  F('ELSOX', 56.0, -20), F('GISTI', 53.5, -20), F('ETARI', 51.0, -20), F('BAKUR', 48.5, -20),
  F('RATSU', 55.5, -15), F('SOMAX', 53.0, -15), F('MALOT', 50.8, -15),
  // North / East / South gates
  F('RESNO', 64.5, -14, true), F('NOKIN', 62.3, -8), F('KOPOR', 61.0, 4.0, true), F('NORKO', 57.5, 5.5, true),
  F('REKNA', 55.2, 6.0, true), F('ABTUM', 52.4, 4.0, true), F('LAMSO', 50.8, 3.2, true), F('NEVIL', 50.2, 0.8, true),
  F('BEDEK', 45.5, -3.0, true), F('ETRAT', 46.6, -8.0, true), F('CHANL', 49.3, -2.6),
  // Ireland
  F('DONEG', 55.0, -9.0), F('BANBA', 53.8, -10.6), F('SHANN', 52.7, -9.0), F('CORKY', 51.8, -8.4), F('SLANY', 52.2, -10.6),
  F('DUB', 53.5, -6.2), F('BOYNE', 53.95, -6.5), F('BEL', 54.6, -6.0),
  // Irish Sea / Wales / west England
  F('IOM', 54.1, -4.7), F('WAL', 53.4, -3.1), F('SLP', 52.0, -5.1), F('BCN', 51.9, -3.3), F('DCS', 54.7, -3.3),
  F('CPT', 51.5, -1.2), F('EXE', 50.73, -3.4), F('SCILY', 49.9, -6.3), F('TOR', 50.55, -5.0), F('LND', 50.1, -5.7),
  // England
  F('MCT', 53.36, -2.12), F('POL', 53.75, -2.1), F('TNT', 52.97, -1.62), F('HON', 52.35, -1.65), F('DTY', 52.18, -1.1),
  F('BNN', 51.72, -0.55), F('LAM', 51.65, 0.15), F('OCK', 51.3, -0.45), F('BIG', 51.33, 0.03), F('DET', 51.3, 0.6),
  F('DVR', 51.17, 1.36), F('LYD', 50.98, 0.88), F('MID', 50.98, -0.62), F('SAM', 50.95, -1.35),
  F('SXT', 54.2, -0.5), F('HUMBR', 53.6, 0.2), F('NORFK', 52.9, 1.2), F('CLN', 51.8, 1.1), F('NEWTN', 55.0, -1.7),
  // Scotland / north
  F('TLA', 55.5, -3.4), F('GOW', 55.85, -4.45), F('PTH', 56.4, -3.4), F('ADN', 57.3, -2.3), F('INV', 57.5, -4.0),
  F('STN', 58.2, -6.3), F('SUM', 59.9, -1.3), F('BEN', 57.5, -7.4), F('TIREE', 56.5, -6.9), F('TYN', 55.3, -1.0),
  F('ALVIN', 59.0, 1.0),
  // Offshore installations (helicopter destinations)
  F('BRENT', 61.0, 1.7, false, true), F('NINIAN', 60.8, 1.5, false, true), F('FORTIES', 57.7, 0.9, false, true), F('PIPER', 58.4, 0.3, false, true),
  F('MORCB', 53.9, -3.4, false, true),
]
export const FIX_MAP: Record<string, Fix> = Object.fromEntries(FIXES.map((f) => [f.id, f]))

export interface Airway { name: string; fixes: string[]; lower?: boolean }
export const AIRWAYS: Airway[] = [
  { name: 'UN54', fixes: ['AMASO', 'ELSOX', 'RATSU', 'DONEG', 'BEL'] },
  { name: 'UL15', fixes: ['NEBIN', 'GISTI', 'SOMAX', 'SHANN', 'DUB'] },
  { name: 'UN57', fixes: ['LOGSU', 'ETARI', 'MALOT', 'CORKY', 'SLP', 'BCN', 'CPT'] },
  { name: 'UL9', fixes: ['KOGAD', 'BAKUR', 'SCILY', 'EXE', 'CPT'] },
  { name: 'UL10', fixes: ['DUB', 'WAL', 'MCT', 'TNT', 'DTY', 'BNN', 'LAM', 'DET', 'DVR', 'LAMSO'] },
  { name: 'UN601', fixes: ['SUM', 'ADN', 'PTH', 'TLA', 'POL', 'TNT'] },
  { name: 'UL620', fixes: ['RESNO', 'NOKIN', 'SUM'] },
  { name: 'UN862', fixes: ['NOKIN', 'STN', 'BEN', 'DONEG'] },
  { name: 'UL7', fixes: ['KOPOR', 'ALVIN', 'ADN'] },
  { name: 'UL8', fixes: ['NORKO', 'FORTIES', 'ADN'] },
  { name: 'UN13', fixes: ['REKNA', 'TYN', 'TLA'] },
  { name: 'UL607', fixes: ['TYN', 'NEWTN', 'SXT', 'HUMBR', 'NORFK', 'ABTUM'] },
  { name: 'UN14', fixes: ['ABTUM', 'CLN', 'LAM'] },
  { name: 'UL18', fixes: ['NEVIL', 'LYD', 'MID', 'SAM', 'EXE'] },
  { name: 'UL19', fixes: ['BEDEK', 'CHANL', 'NEVIL'] },
  { name: 'UL21', fixes: ['ETRAT', 'CHANL'] },
  { name: 'UN16', fixes: ['ETRAT', 'SCILY'] },
  { name: 'UN30', fixes: ['BEL', 'IOM', 'WAL'] },
  { name: 'UN31', fixes: ['BEL', 'TLA'] },
  { name: 'UN32', fixes: ['BEL', 'GOW', 'PTH'] },
  { name: 'UN33', fixes: ['DUB', 'BOYNE', 'BEL'] },
  { name: 'UN34', fixes: ['SHANN', 'CORKY'] },
  { name: 'UN35', fixes: ['SHANN', 'BANBA', 'DONEG'] },
  { name: 'UN36', fixes: ['SLANY', 'SHANN'] },
  { name: 'UN37', fixes: ['SOMAX', 'SLANY', 'MALOT'] },
  { name: 'UN38', fixes: ['TIREE', 'GOW'] },
  { name: 'UN39', fixes: ['BEN', 'TIREE'] },
  { name: 'UN40', fixes: ['INV', 'ADN'] },
  { name: 'UN41', fixes: ['INV', 'PTH'] },
  { name: 'UN42', fixes: ['STN', 'INV'] },
  { name: 'UN43', fixes: ['TNT', 'HUMBR'] },
  { name: 'UN44', fixes: ['POL', 'SXT'] },
  { name: 'UN45', fixes: ['DCS', 'TLA'] },
  { name: 'UN46', fixes: ['DCS', 'WAL'] },
  { name: 'UN47', fixes: ['HON', 'BCN'] },
  { name: 'UN48', fixes: ['MCT', 'POL'] },
  { name: 'UN49', fixes: ['LAM', 'BIG', 'OCK', 'MID'] },
  { name: 'UN50', fixes: ['BNN', 'OCK'] },
  { name: 'UN51', fixes: ['CPT', 'BNN'] },
  { name: 'UN52', fixes: ['CPT', 'SAM'] },
  { name: 'UN53', fixes: ['SCILY', 'LND', 'TOR', 'EXE'] },
  { name: 'UN55', fixes: ['TOR', 'SLP'] },
  { name: 'UN56', fixes: ['CLN', 'NORFK'] },
  { name: 'UN58', fixes: ['ADN', 'FORTIES'] },
]

export interface Region { id: string; name: string; kind: 'FIR' | 'ADIZ' | 'OCEANIC' | 'CTA'; poly: LatLon[] }
const P = (...p: [number, number][]) => p.map(([lat, lon]) => ({ lat, lon }))
export const REGIONS: Region[] = [
  { id: 'UKADR', name: 'UK AIR DEFENCE REGION', kind: 'ADIZ',
    poly: P([62.5, -19], [62.5, 3], [58, 4.2], [53.5, 4], [51.6, 3.4], [50.3, 1.2], [49.0, -2.5], [48.8, -9], [51, -13], [54, -15], [58, -18]) },
  { id: 'SCOTTISH', name: 'SCOTTISH FIR', kind: 'FIR',
    poly: P([61, -15], [61, 4], [55.2, 4], [55.0, -2.0], [54.6, -5.0], [54.6, -8], [55.0, -15]) },
  { id: 'LONDON', name: 'LONDON FIR', kind: 'FIR',
    poly: P([55.0, -2.0], [55.2, 4], [52.0, 3.0], [51.3, 2.3], [50.3, 1.0], [49.2, -2.0], [49.0, -6.0], [50.5, -6.0], [51.6, -5.4], [52.8, -4.6], [53.9, -4.7], [54.6, -5.0]) },
  { id: 'SHANNON', name: 'SHANNON FIR / UIR', kind: 'FIR',
    poly: P([55.0, -15], [54.6, -8], [54.0, -6.2], [52.8, -5.8], [51.6, -6.0], [51.0, -8], [51.0, -15]) },
  { id: 'SHANWICK', name: 'SHANWICK OCEANIC', kind: 'OCEANIC',
    poly: P([61, -30], [61, -15], [55, -15], [51, -15], [45, -15], [45, -30]) },
  { id: 'BREST', name: 'BREST UIR', kind: 'FIR',
    poly: P([49.0, -2.0], [48.5, 1.5], [46, 1.5], [44, -1.5], [44, -10], [49.0, -9]) },
]
export interface Zone { id: string; name: string; lat: number; lon: number; r: number; kind: 'DANGER' | 'CTR'; active: boolean }
export const ZONES: Zone[] = [
  { id: 'D613', name: 'D613 CARDIGAN BAY', lat: 52.3, lon: -4.8, r: 26, kind: 'DANGER', active: true },
  { id: 'D512', name: 'D512 CAPE WRATH', lat: 58.6, lon: -5.0, r: 14, kind: 'DANGER', active: true },
  { id: 'D323', name: 'D323 HEBRIDES', lat: 57.3, lon: -7.9, r: 22, kind: 'DANGER', active: true },
  { id: 'D001', name: 'D001 SALISBURY PLAIN', lat: 51.2, lon: -1.9, r: 12, kind: 'DANGER', active: true },
  { id: 'D036', name: 'D036 THE WASH', lat: 52.95, lon: 0.4, r: 9, kind: 'DANGER', active: true },
  { id: 'D406', name: 'D406 SPADEADAM', lat: 55.05, lon: -2.55, r: 8, kind: 'DANGER', active: true },
]
/** Which gate fix a far/overseas airport is reached through. */
export const GATE_FOR: Record<string, string> = {
  LFPG: 'LAMSO', LFPO: 'LAMSO', EBBR: 'LAMSO', ELLX: 'LAMSO', LSZH: 'LAMSO', LIRF: 'LAMSO', LFMN: 'LAMSO', LOWW: 'ABTUM',
  EHAM: 'ABTUM', EDDF: 'ABTUM', EDDM: 'ABTUM', EDDL: 'ABTUM', EDDH: 'REKNA', EKCH: 'REKNA', ENGM: 'KOPOR', ESSA: 'KOPOR', EFHK: 'KOPOR',
  LEMD: 'BEDEK', LEBL: 'BEDEK', LFBO: 'BEDEK', LPPT: 'ETRAT', BIKF: 'RESNO',
  KJFK: 'NEBIN', KEWR: 'NEBIN', KBOS: 'AMASO', CYYZ: 'AMASO', CYUL: 'AMASO', KORD: 'AMASO', KIAD: 'LOGSU', KATL: 'LOGSU', KMIA: 'KOGAD', KLAX: 'AMASO',
  OMDB: 'ABTUM', VHHH: 'ABTUM', WSSS: 'LAMSO', VIDP: 'ABTUM', LTBA: 'ABTUM',
}

import type { Radar } from '../types'
type RD = Omit<Radar, 'status' | 'condition' | 'interference' | 'angle' | 'hits' | 'lastHit' | 'repairUntil' | 'repairTeam' | 'note'>
export const RADAR_DEFS: RD[] = [
  { id: 'SAXA', name: 'RRH Saxa Vord', lat: 60.83, lon: -0.83, antennaFt: 900, primaryRange: 230, secondaryRange: 250, sweepSec: 10, phase: 0, wxSens: 0.5 },
  { id: 'BENB', name: 'RRH Benbecula', lat: 57.40, lon: -7.35, antennaFt: 400, primaryRange: 230, secondaryRange: 250, sweepSec: 10, phase: 55, wxSens: 0.6, mask: { from: 60, to: 130, factor: 0.55 } },
  { id: 'BUCH', name: 'RRH Buchan', lat: 57.47, lon: -1.82, antennaFt: 520, primaryRange: 250, secondaryRange: 250, sweepSec: 10, phase: 110, wxSens: 0.5 },
  { id: 'BOUL', name: 'RRH Boulmer', lat: 55.42, lon: -1.61, antennaFt: 300, primaryRange: 240, secondaryRange: 250, sweepSec: 10, phase: 160, wxSens: 0.5 },
  { id: 'STAX', name: 'RRH Staxton Wold', lat: 54.20, lon: -0.43, antennaFt: 600, primaryRange: 250, secondaryRange: 250, sweepSec: 10, phase: 210, wxSens: 0.5 },
  { id: 'NEAT', name: 'RRH Neatishead', lat: 52.76, lon: 1.47, antennaFt: 200, primaryRange: 250, secondaryRange: 250, sweepSec: 10, phase: 260, wxSens: 0.5 },
  { id: 'PORT', name: 'RRH Portreath', lat: 50.28, lon: -5.29, antennaFt: 500, primaryRange: 240, secondaryRange: 250, sweepSec: 10, phase: 305, wxSens: 0.55, mask: { from: 150, to: 200, factor: 0.7 } },
  { id: 'BISH', name: 'RRH Bishops Court', lat: 54.30, lon: -5.60, antennaFt: 350, primaryRange: 220, secondaryRange: 240, sweepSec: 10, phase: 340, wxSens: 0.6 },
]

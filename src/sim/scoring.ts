import type { GameState } from './types'
export interface Scores { identification: number; awareness: number; resources: number; incidents: number; overall: number; grade: string; notes: string[] }
const c = (v: number) => Math.max(0, Math.min(100, v))
export function computeScores(st: GameState): Scores {
  const s = st.score, notes: string[] = []
  const idN = s.idCorrect + s.idWrong + s.falseAlarms
  const identification = idN === 0 ? 75 : c(100 * (s.idCorrect / (s.idCorrect + s.idWrong * 2.2 + s.falseAlarms * 0.6 + s.idLate * 0.5)))
  const intelN = s.intelCorrect + s.intelWrong
  const ackAvg = s.ackCount ? s.ackLatencySum / s.ackCount : 0
  let awareness = 92 - s.unknownLapse * 6 - s.undetected * 8 - s.emergencyMissed * 8 - s.idLate * 3
  if (intelN) awareness += (s.intelCorrect / intelN - 0.6) * 25
  if (ackAvg > 120) awareness -= Math.min(15, (ackAvg - 120) / 20)
  awareness = c(awareness)
  const afs = Object.values(st.airfields)
  const fuelFrac = afs.length ? afs.reduce((a, f) => a + f.fuelKg / f.fuelCap, 0) / afs.length : 1
  const assets = Object.values(st.assets)
  const avail = assets.length ? assets.filter((a) => a.status !== 'US' && a.status !== 'MAINT').length / assets.length : 1
  let resources = 45 + fuelFrac * 30 + avail * 25 - s.bingoEvents * 5 - s.maintLost * 2 - s.opsAborted * 1.5 - s.opsFailed * 4
  resources = c(resources)
  const tot = s.incidentsTotal
  let incidents = tot === 0 ? 80 : c(100 * ((s.incidentsHandled + 0.0) / Math.max(1, tot - openCount(st) * 0.5)) - s.incidentsFailed * 3 + s.bonus * 0.3)
  if (tot > 0 && s.incidentsHandled === 0 && s.incidentsFailed === 0) incidents = 70
  const overall = identification * 0.3 + awareness * 0.2 + resources * 0.2 + c(incidents) * 0.3
  if (s.idWrong) notes.push(`${s.idWrong} misidentification(s)`)
  if (s.unknownLapse >= 1) notes.push('Unknown contacts left unresolved too long')
  if (s.undetected) notes.push(`${s.undetected} aircraft crossed undetected — review radar coverage`)
  if (s.bingoEvents) notes.push(`${s.bingoEvents} bingo-fuel event(s)`)
  if (s.emergencyMissed) notes.push(`${s.emergencyMissed} emergency/ies not alerted in time`)
  const grade = overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 65 ? 'C' : overall >= 50 ? 'D' : 'E'
  return { identification: Math.round(identification), awareness: Math.round(awareness), resources: Math.round(resources), incidents: Math.round(c(incidents)), overall: Math.round(overall), grade, notes }
}
const openCount = (st: GameState) => st.incidents.filter((i) => i.closed === null).length
export const newLedger = () => ({ idCorrect: 0, idWrong: 0, falseAlarms: 0, idLate: 0, incidentsHandled: 0, incidentsFailed: 0, incidentsTotal: 0, ackLatencySum: 0, ackCount: 0, intelCorrect: 0, intelWrong: 0, unknownLapse: 0, fuelWasteKg: 0, bingoEvents: 0, opsCompleted: 0, opsAborted: 0, opsFailed: 0, maintLost: 0, coverageGapSec: 0, aircraftTracked: 0, emergencyMissed: 0, undetected: 0, bonus: 0, log: [] as string[] })

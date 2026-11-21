import { fmtHM } from './geo'
import { say } from './comms'
import type { GameState, Incident, IncidentKind } from './types'

export function openIncident(st: GameState, p: { kind: IncidentKind; title: string; severity: 1 | 2 | 3; entityId?: string | null; needs: string; deadlineSec: number; radarId?: string; announce?: boolean }): Incident {
  const inc: Incident = {
    id: `INC${String(st.incidents.length + 1).padStart(3, '0')}`, kind: p.kind, title: p.title, severity: p.severity, entityId: p.entityId ?? null, radarId: p.radarId,
    opened: st.t, closed: null, status: 'OPEN', acked: false, ackedAt: null, actioned: false, needs: p.needs, result: '', log: [`${fmtHM(st.t)} Incident opened`], deadline: st.t + p.deadlineSec,
  }
  st.incidents.push(inc); st.score.incidentsTotal++
  st.events.push({ type: 'alert', text: p.title, sev: p.severity })
  return inc
}
export function ackIncident(st: GameState, id: string) {
  const inc = st.incidents.find((i) => i.id === id); if (!inc || inc.acked) return
  inc.acked = true; inc.ackedAt = st.t; if (inc.status === 'OPEN') inc.status = 'ACKNOWLEDGED'
  inc.log.push(`${fmtHM(st.t)} Acknowledged by operator`)
  st.score.ackLatencySum += st.t - inc.opened; st.score.ackCount++
}
export function closeIncident(st: GameState, inc: Incident, status: 'RESOLVED' | 'FAILED' | 'STOOD DOWN', result: string) {
  if (inc.closed !== null) return
  inc.status = status; inc.closed = st.t; inc.result = result; inc.log.push(`${fmtHM(st.t)} ${status}: ${result}`)
  if (status === 'RESOLVED') { st.score.incidentsHandled += inc.acked ? 1 : 0.5 ; st.score.bonus += inc.severity * 2; if (inc.kind !== 'HOSTILE') { st.coins += 10 * inc.severity; st.coinLog.push({ t: st.t, n: 10 * inc.severity, why: 'Incident handled' }) } }
  else if (status === 'FAILED') { st.score.incidentsFailed++; st.score.bonus -= inc.severity * 4; st.coins -= 8 * inc.severity; st.coinLog.push({ t: st.t, n: -8 * inc.severity, why: 'Incident failed' }); say(st, { channel: 'OPS', from: 'WATCH SUPERVISOR', to: 'OPS', text: `${inc.title}: ${result}.`, voice: 'OPS', sev: 'URGENT', ref: inc.id, refKind: 'incident' }) }
}
export const incidentsFor = (st: GameState, entityId: string) => st.incidents.filter((i) => i.entityId === entityId && i.closed === null)
export function resolveFor(st: GameState, entityId: string, kinds: IncidentKind[] | null, result: string) {
  for (const inc of incidentsFor(st, entityId)) if (!kinds || kinds.includes(inc.kind)) { if (!inc.acked) ackIncident(st, inc.id); closeIncident(st, inc, 'RESOLVED', result) }
}

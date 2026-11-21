import { OP_BY_CODE } from './data/registry'
import type { Aircraft, GameState, Message } from './types'

export type SayInput = Omit<Message, 'id' | 't' | 'sev' | 'speak'> & { sev?: Message['sev']; speak?: boolean }
/** All communications originate here: every message is stamped with sim time and optionally linked to the entity it concerns. */
export function say(st: GameState, m: SayInput): Message {
  const msg: Message = { ...m, id: st.messages.length ? st.messages[st.messages.length - 1].id + 1 : 1, t: st.t, sev: m.sev ?? 'ROUTINE', speak: m.speak ?? true }
  st.messages.push(msg)
  if (st.messages.length > 4000) st.messages.splice(0, 500)
  st.events.push({ type: 'msg', msg })
  return msg
}
const PH: Record<string, string> = { A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine' }
export const phonetic = (s: string) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase().split('').map((c) => PH[c] ?? c).join(' ')
/** Radiotelephony form of a callsign: "BAW123" -> "SPEEDBIRD 123". */
export function rt(ac: Pick<Aircraft, 'callsign' | 'role' | 'reg'> | string): string {
  const cs = typeof ac === 'string' ? ac : ac.callsign
  const m = /^([A-Z]{3})(\d{1,4}[A-Z]?)$/.exec(cs)
  if (m && OP_BY_CODE[m[1]]) return `${OP_BY_CODE[m[1]].rt} ${m[2]}`
  return cs
}
export const flStr = (alt: number) => (alt >= 5500 ? `flight level ${String(Math.round(alt / 100)).padStart(3, '0')}` : `${Math.round(alt / 100) * 100} feet`)
export const angels = (alt: number) => `angels ${Math.round(alt / 1000)}`
export function searchMessages(list: Message[], q: string, channel: string | null) {
  const s = q.trim().toLowerCase()
  return list.filter((m) => (!channel || m.channel === channel) && (!s || m.text.toLowerCase().includes(s) || m.from.toLowerCase().includes(s) || m.to.toLowerCase().includes(s) || (m.ref ?? '').toLowerCase().includes(s)))
}

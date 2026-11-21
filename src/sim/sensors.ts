import { ASSET_TYPES } from './data/aircraftTypes'
import { distNm } from './geo'
import { rt } from './comms'
import { updateTrack } from './radar'
import type { GameState, Plot } from './types'

/** Fighter intercept radars and Nimrod R1 ESM/COMINT collection. */
export function stepSensors(st: GameState) {
  const assets = Object.values(st.assets).filter((a) => a.ac && a.status !== 'LAUNCHING')
  if (!assets.length) return
  const acs = Object.values(st.aircraft)
  if (st.tick % 4 === 0) {
    for (const a of assets) {
      const t = ASSET_TYPES[a.typeId]; if (t.radar <= 0 || t.role !== 'FIGHTER' || a.ac!.alt < 1500) continue
      for (const o of acs) {
        if (o === a.ac || o.kind === 'asset') continue
        const d = distNm(a.ac!, o); if (d > t.radar || d < 0.5) continue
        const rcs = Math.pow(Math.max(o.rcs, 0.03), 0.25)
        if (d > t.radar * Math.min(1, rcs) * 1.0) continue
        if (st.rng.next() > 0.88) continue
        const sig = 0.03 + d * 0.0008
        const plot: Plot = { t: st.t, lat: o.lat + (st.rng.gauss() * sig) / 60, lon: o.lon + (st.rng.gauss() * sig) / 60, alt: Math.round(o.alt / 100) * 100, radar: a.callsign }
        updateTrack(st, o, plot, o.xpdr.on)
      }
    }
  }
  if (st.tick % 5 === 0) {
    for (const a of assets) {
      if (a.typeId !== 'R1' || a.ac!.alt < 15000) continue
      for (const o of acs) {
        if (o === a.ac || o.kind === 'asset') continue
        const d = distNm(a.ac!, o); if (d > 300) continue
        if (d > 1.23 * (Math.sqrt(a.ac!.alt) + Math.sqrt(Math.max(o.alt, 1)))) continue
        const tr = st.tracks[st.trackByEntity[o.id]]; if (!tr || tr.dropped) continue
        if (!tr.esm && o.emitter !== 'NONE') {
          tr.esm = o.emitter === 'WXR' ? 'Civil weather radar emissions — airliner/business type' : o.emitter === 'NAV' ? 'Navigation radar — light aircraft/helicopter class' : 'Military search radar emissions'
          tr.log.push(`${st.t}|ESM: ${tr.esm}`)
        } else if (!tr.esm && o.emitter === 'NONE' && o.kind !== 'phenomenon' && d < 250 && o.truth.intent === 'foreignState') { tr.esm = 'Emitting silent. Aircraft type consistent with large long-range patrol aircraft'; }
        if (!tr.comint && st.rng.chance(0.12)) {
          if (o.kind === 'civil' && o.truth.intent !== 'commsFail' && o.truth.intent !== 'unlawful') { tr.comint = o.truth.intent === 'cloned' ? `VHF: pilot using callsign "${rt(o.xpdr.msCallsign)}" — voice/accent inconsistent with operator` : `VHF: callsign heard as "${rt(o)}"`; tr.log.push(`${st.t}|COMINT: ${tr.comint}`) }
          else if (o.truth.intent === 'foreignState') { tr.comint = 'HF: foreign-language traffic, no callsign recovered'; tr.log.push(`${st.t}|COMINT: HF traffic`) }
          else if (o.truth.intent === 'unlawful') { tr.comint = 'VHF: no transmissions from this aircraft'; }
        }
      }
    }
  }
}

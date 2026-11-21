import type { Message } from '../sim/types'

/** Voice (speech synthesis) and synthesised tones. Everything degrades silently when the browser lacks support. */
class AudioEngine {
  ctx: AudioContext | null = null
  volume = 0.7; voiceOn = true; sfxOn = true
  private queue: Message[] = []
  private speaking = false
  private voices: SpeechSynthesisVoice[] = []
  private roleVoice: Record<string, number> = {}
  private ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    return this.ctx
  }
  unlock() { this.ensure(); this.loadVoices() }
  private loadVoices() { try { const v = window.speechSynthesis?.getVoices() ?? []; if (v.length) { const en = v.filter((x) => x.lang.startsWith('en')); const gb = en.filter((x) => x.lang.includes('GB')); this.voices = gb.length >= 2 ? gb.concat(en.filter((x) => !gb.includes(x))) : en.length ? en : v } } catch { /* none */ } }
  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, when = 0) {
    if (!this.sfxOn || this.volume === 0) return
    const c = this.ensure(); if (!c) return
    const o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.value = freq
    const t0 = c.currentTime + when
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * this.volume, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02)
  }
  noise(dur: number, vol = 0.08, when = 0) {
    if (!this.sfxOn || this.volume === 0) return
    const c = this.ensure(); if (!c) return
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 1800; g.gain.value = vol * this.volume
    s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + when)
  }
  newContact() { this.tone(880, 0.08, 'square', 0.05) }
  chime() { this.tone(660, 0.18, 'sine', 0.12); this.tone(880, 0.25, 'sine', 0.12, 0.15) }
  alarm() { for (let i = 0; i < 3; i++) { this.tone(960, 0.18, 'square', 0.12, i * 0.4); this.tone(720, 0.18, 'square', 0.12, i * 0.4 + 0.2) } }
  warble() { for (let i = 0; i < 4; i++) this.tone(i % 2 ? 520 : 780, 0.12, 'sawtooth', 0.08, i * 0.13) }
  click() { this.noise(0.05, 0.06) }
  speak(m: Message) {
    if (!this.voiceOn || !m.speak || this.volume === 0) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (m.sev === 'ROUTINE' && this.queue.length > 2) return
    if (this.queue.length > 5) this.queue.shift()
    this.queue.push(m); this.pump()
  }
  stopAll() { this.queue = []; try { window.speechSynthesis?.cancel() } catch { /* none */ } this.speaking = false }
  private pump() {
    if (this.speaking) return
    const m = this.queue.shift(); if (!m) return
    if (!this.voices.length) this.loadVoices()
    this.speaking = true
    const prof: Record<string, [number, number, number]> = { CONTROLLER: [1.25, 1.0, 0], PILOT: [0.75, 1.12, 1], INTEL: [0.55, 0.92, 2], AIRFIELD: [1.0, 1.02, 3], TANKER: [0.65, 1.05, 4], OPS: [1.1, 1.0, 5], SYSTEM: [1.5, 1.1, 0] }
    const [pitch, rate, vi] = prof[m.voice] ?? [1, 1, 0]
    this.noise(0.12, 0.07)
    const txt = m.text.replace(/\bFL(\d+)/g, 'flight level $1').replace(/\bNM\b/g, 'nautical miles').replace(/\bkt\b/g, 'knots').replace(/\bSSR\b/g, 'S S R').replace(/[A-Z]{3}\d{1,4}\b/g, (x) => x)
    const done = () => { this.noise(0.08, 0.05); this.speaking = false; setTimeout(() => this.pump(), 250) }
    try {
      const u = new SpeechSynthesisUtterance(txt)
      u.pitch = pitch; u.rate = rate; u.volume = this.volume
      if (this.voices.length) u.voice = this.voices[vi % this.voices.length]
      u.lang = u.voice?.lang ?? 'en-GB'
      u.onend = done; u.onerror = done
      window.speechSynthesis.speak(u)
      setTimeout(() => { if (this.speaking && !window.speechSynthesis.speaking) done() }, 3000 + txt.length * 90)
    } catch { done() }
  }
}
export const audio = new AudioEngine()

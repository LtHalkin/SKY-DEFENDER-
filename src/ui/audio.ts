import type { Message } from '../sim/types'

/** Voice (speech synthesis) and synthesised tones. Everything degrades silently when the browser lacks support. */
class AudioEngine {
  ctx: AudioContext | null = null
  volume = 0.7; voiceOn = true; sfxOn = true
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
  launch() {
    if (!this.sfxOn || this.volume === 0) return
    const c = this.ensure(); if (!c) return
    const n = Math.floor(c.sampleRate * 0.9), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 800) * (1 - i / n)
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'bandpass'; f.frequency.setValueAtTime(400, c.currentTime); f.frequency.exponentialRampToValueAtTime(3000, c.currentTime + 0.8); g.gain.value = 0.25 * this.volume
    s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start()
  }
  boom() {
    if (!this.sfxOn || this.volume === 0) return
    const c = this.ensure(); if (!c) return
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'
    o.frequency.setValueAtTime(110, c.currentTime); o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 1.2)
    g.gain.setValueAtTime(0.5 * this.volume, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.3)
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 1.4); this.noise(0.6, 0.2)
  }
  coin() { this.tone(1320, 0.07, 'square', 0.04); this.tone(1760, 0.12, 'square', 0.04, 0.07) }
  ui() { this.tone(900, 0.04, 'square', 0.03) }
  eleven = { key: '' }
  elevenErr = ''
  private cache = new Map<string, string>()
  private inflight = 0
  private waiters: (() => void)[] = []
  private queue: { m: Message; txt: string; url?: Promise<string | null> }[] = []
  private clean(t: string) { return t.replace(/\bFL(\d+)/g, 'flight level $1').replace(/\bNM\b/g, 'nautical miles').replace(/\bKT\b|\bkt\b/g, 'knots').replace(/\bSSR\b/g, 'S S R').replace(/\bRAF\b/g, 'R A F').replace(/[◆★▶]/g, '') }
  get usingEleven() { return !!this.eleven.key }
  speak(m: Message) {
    if (!this.voiceOn || !m.speak || this.volume === 0) return
    if (typeof window === 'undefined') return
    if (m.sev === 'ROUTINE' && this.queue.length > 3) return
    while (this.queue.length > 6) { const i = this.queue.findIndex((q) => q.m.sev !== 'URGENT'); this.queue.splice(i >= 0 ? i : 0, 1) }
    const item: { m: Message; txt: string; url?: Promise<string | null> } = { m, txt: this.clean(m.text) }
    if (this.usingEleven) item.url = this.fetchEleven(m.voice, item.txt) // fetch ahead while earlier lines play
    this.queue.push(item); this.pump()
  }
  stopAll() { this.queue = []; try { window.speechSynthesis?.cancel() } catch { /* none */ } this.current?.pause(); this.current = null; this.speaking = false }
  private current: HTMLAudioElement | null = null
  private async slot() { if (this.inflight < 2) { this.inflight++; return } await new Promise<void>((r) => this.waiters.push(r)); this.inflight++ }
  private release() { this.inflight--; this.waiters.shift()?.() }
  /** Text-to-speech through ElevenLabs with retries; resolves to a playable blob URL or null. */
  async fetchEleven(role: string, txt: string): Promise<string | null> {
    const id = ELEVEN_VOICES[role] ?? ELEVEN_VOICES.OPS, ck = id + '|' + txt
    const hit = this.cache.get(ck); if (hit) return hit
    await this.slot()
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': this.eleven.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: txt, model_id: 'eleven_turbo_v2_5' }) })
          if (r.ok) { const url = URL.createObjectURL(await r.blob()); this.cache.set(ck, url); if (this.cache.size > 120) { const [k0, u0] = this.cache.entries().next().value!; this.cache.delete(k0); setTimeout(() => URL.revokeObjectURL(u0), 60000) } this.elevenErr = ''; return url }
          if (r.status === 401 || r.status === 403) { this.elevenErr = `ElevenLabs rejected the key (${r.status})`; return null }
          if (r.status === 400 || r.status === 422) { this.elevenErr = `ElevenLabs error ${r.status}`; return null }
          this.elevenErr = `ElevenLabs busy (${r.status}), retrying`
        } catch { this.elevenErr = 'ElevenLabs unreachable, retrying' }
        await new Promise((res) => setTimeout(res, 700 * (attempt + 1)))
      }
      return null
    } finally { this.release() }
  }
  private pump() {
    if (this.speaking) return
    const item = this.queue.shift(); if (!item) return
    if (!this.voices.length) this.loadVoices()
    this.speaking = true
    const m = item.m, txt = item.txt
    const done = () => { this.noise(0.08, 0.05); this.current = null; this.speaking = false; setTimeout(() => this.pump(), 200) }
    if (item.url) {
      item.url.then((url) => {
        if (!url) { done(); return } // ElevenLabs is on: never fall back to the browser voice
        this.noise(0.12, 0.07)
        const a = new Audio(url); a.volume = this.volume; this.current = a
        a.onended = done; a.onerror = done; a.play().catch(done)
      })
      return
    }
    this.noise(0.12, 0.07)
    const prof: Record<string, [number, number, number]> = { CONTROLLER: [1.25, 1.0, 0], PILOT: [0.75, 1.12, 1], INTEL: [0.55, 0.92, 2], AIRFIELD: [1.0, 1.02, 3], TANKER: [0.65, 1.05, 4], OPS: [1.1, 1.0, 5], SYSTEM: [1.5, 1.1, 0] }
    const [pitch, rate, vi] = prof[m.voice] ?? [1, 1, 0]
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
/** Default ElevenLabs premade voices per radio role. */
export const ELEVEN_VOICES: Record<string, string> = { CONTROLLER: '21m00Tcm4TlvDq8ikWAM', PILOT: 'pNInz6obpgDQGcFmaJgB', INTEL: 'TxGEqnHWrfWFTfGW9XjX', AIRFIELD: 'ErXwobaYiN019PkySvjV', TANKER: 'VR6AewLTigWG4xSOukaG', OPS: 'EXAVITQu4vr4xnSDxMaL', SYSTEM: 'AZnzlk1XvdvUeBnXmlld' }
export const audio = new AudioEngine()

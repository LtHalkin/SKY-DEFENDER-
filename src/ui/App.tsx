import { useEffect, useRef, useState } from 'react'
import { ASSET_TYPES, BATTERY_TYPES, GROUND_RADARS, RADAR_SITES, RADAR_SITE_MAP, SAM_SITES, SITE_MAP } from '../sim/data/aircraftTypes'
import { MISSIONS, MISSION_MAP, type Mission } from '../sim/campaign'
import { store, useStore } from './store'
import { Game, VoiceSetup } from './Game'
import { audio } from './audio'
import { BASES, ITEMS, UPGRADES, type ItemKind } from '../game/catalog'
import { autoArrange, bestBase, bestRadarSite, bestSamSite } from '../game/placement'
import { exportSave, freshSave, importSave, levelOf, MEDALS, newId, rankOf, redeem, sellPrice, writeSave } from '../game/save'

export function App() {
  const screen = useStore((s) => s.screen)
  useEffect(() => {
    const fit = () => { document.documentElement.style.fontSize = (innerWidth < 900 ? 14 : Math.max(11, Math.min(34, Math.min(innerWidth / 1920, innerHeight / 1080) * 16))) + 'px' }
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit)
  }, [])
  return <div className="app">
    {(screen === 'GAME' || screen === 'DEBRIEF') && <Game />}
    {screen === 'DEBRIEF' && <Debrief />}
    {screen !== 'GAME' && screen !== 'DEBRIEF' && <Shell />}
  </div>
}

function RadarBg() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; let raf = 0
    const blips = Array.from({ length: 26 }, () => ({ a: Math.random() * 6.28, r: 0.15 + Math.random() * 0.8, c: Math.random() < 0.15 ? '#ff3b3b' : Math.random() < 0.25 ? '#ffe34d' : '#f2f2f2', h: Math.random() * 6.28 }))
    let lastT = 0
    const f = (t: number) => {
      raf = requestAnimationFrame(f)
      if (t - lastT < 33) return // 30 fps is plenty for the background
      lastT = t
      if (cv.width !== cv.clientWidth || cv.height !== cv.clientHeight) { cv.width = cv.clientWidth; cv.height = cv.clientHeight }
      const w = cv.width, h = cv.height, cx = w * 0.68, cy = h * 0.52, R = Math.min(w, h) * 0.46
      ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(57,255,122,0.12)'; for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, 7); ctx.stroke() }
      for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos((i * Math.PI) / 6) * R, cy + Math.sin((i * Math.PI) / 6) * R); ctx.stroke() }
      const sw = (t / 1600) % (Math.PI * 2)
      for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(57,255,122,${0.12 * (1 - i / 30)})`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sw - (i + 1) * 0.03, sw - i * 0.03); ctx.fill() }
      for (const b of blips) {
        b.a += 0.0006; const x = cx + Math.cos(b.a) * b.r * R, y = cy + Math.sin(b.a) * b.r * R
        const age = ((sw - b.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        ctx.globalAlpha = Math.max(0.15, 1 - age / 4); ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1
      }
    }
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="bg-radar" />
}

function Shell() {
  const screen = useStore((s) => s.screen)
  const sv = store.save, lv = levelOf(sv.xp)
  const nav = (s: typeof screen) => { audio.unlock(); audio.ui(); store.setScreen(s) }
  return <div className="shell">
    <RadarBg />
    <div className="topnav">
      <span className="brand" onClick={() => nav('HOME')}>SKY DEFENDER</span>
      {(['HOME', 'CAMPAIGN', 'SHOP', 'HANGAR', 'STATS', 'SETTINGS'] as const).map((s) => <button key={s} className={screen === s ? 'on' : ''} onClick={() => nav(s)}>{s === 'STATS' ? 'RECORDS' : s}</button>)}
      <span className="spacer" />
      <span className="pill">{rankOf(lv.level).toUpperCase()} · LV {lv.level}</span><span className="pill coin">◆ {sv.coins.toLocaleString()}</span>
    </div>
    <div className="page">
      {screen === 'HOME' && <Home />}{screen === 'CAMPAIGN' && <Campaign />}{screen === 'SHOP' && <Shop />}{screen === 'HANGAR' && <Hangar />}{screen === 'STATS' && <Stats />}{screen === 'SETTINGS' && <Settings />}
    </div>
  </div>
}

function Home() {
  const sv = store.save, lv = levelOf(sv.xp)
  const next = ITEMS.filter((i) => !sv.fleet.some((f) => f.typeId === i.id) && i.kind === 'JET').sort((a, b) => a.price - b.price)[0]
  const fighters = sv.fleet.filter((f) => ASSET_TYPES[f.typeId].role === 'FIGHTER').length
  return <div className="home">
    <div className="hero">
      <div className="logo">SKY DEFENDER</div>
      <div className="sub">UK AIR DEFENCE · 1998</div>
      <p className="lead">You run the radar. Find the unknowns, help aircraft in trouble, turn intruders away — and when a bandit refuses, shoot it down before it reaches its target.</p>
      <div className="go-row"><button className="big-go" onClick={() => store.setScreen('CAMPAIGN')}>CAMPAIGN ▶<small>{Object.values(sv.campaign).reduce((a, b) => a + b, 0)} / {MISSIONS.length * 3} ★</small></button>
        <button className="big-go alt" onClick={() => store.startShift()}>FREE SHIFT {sv.stats.shifts + 1} ▶<small>random raids, endless progression</small></button></div>
      {!sv.tutorial && <p className="dim">First shift: tips at the top of the screen walk you through it.</p>}
    </div>
    <div className="cards">
      <div className="card"><small>{rankOf(lv.level).toUpperCase()}</small><b>LEVEL {lv.level}</b><div className="xp"><i style={{ width: `${(lv.into / lv.need) * 100}%` }} /></div><span className="dim">{lv.into} / {lv.need} XP</span></div>
      <div className="card"><small>SKYCOINS</small><b className="coin">◆ {sv.coins.toLocaleString()}</b>{next && <span className="dim">Next jet: {ASSET_TYPES[next.id].short} — ◆{next.price}</span>}</div>
      <div className="card"><small>YOUR FORCE</small><b>{fighters} fighters · {sv.batteries.length} SAM</b><span className="dim">{sv.fleet.length - fighters} support aircraft</span></div>
      <div className="card"><small>LAST SHIFT</small><b>{sv.lastShift ? `GRADE ${sv.lastShift.grade}` : '—'}</b><span className="dim">{sv.lastShift ? `${sv.lastShift.coins >= 0 ? '+' : ''}${sv.lastShift.coins} coins · score ${sv.lastShift.score}` : 'No shifts yet'}</span></div>
    </div>
    <div className="how">
      <div><b className="y">1 · CHECK</b><p>Yellow planes are unknown. CHECK IT asks air traffic control and the registry.</p></div>
      <div><b className="o">2 · HELP</b><p>Orange planes are in trouble. Alert the airport so they can land safely.</p></div>
      <div><b className="p">3 · INTERCEPT</b><p>Send a jet to look. If it is a bandit, warn it — most turn away.</p></div>
      <div><b className="r">4 · DEFEND</b><p>If it refuses, ENGAGE with a jet or fire your SAM batteries before it reaches its target.</p></div>
    </div>
  </div>
}

const STAT = ({ k, v, max }: { k: string; v: number; max: number }) => <div className="statbar"><span>{k}</span><i><em style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></i></div>
function Shop() {
  const [tab, setTab] = useState<ItemKind>('JET')
  const [base, setBase] = useState('AUTO'); const [site, setSite] = useState('AUTO'); const [msg, setMsg] = useState('')
  useStore((s) => s.version)
  const sv = store.save, lvl = levelOf(sv.xp).level
  const [rsite, setRsite] = useState('AUTO')
  const buy = (id: string, price: number, kind: ItemKind) => {
    if (sv.coins < price) { setMsg('Not enough Skycoins'); return }
    sv.coins -= price
    const site2 = kind !== 'SAM' ? site : site === 'AUTO' ? bestSamSite(sv, id) : site, rsite2 = kind !== 'RADAR' ? rsite : rsite === 'AUTO' ? bestRadarSite(sv, id) : rsite, base2 = kind === 'SAM' || kind === 'RADAR' ? base : base === 'AUTO' ? bestBase(sv, id) : base
    if (kind === 'SAM') sv.batteries.push({ id: newId('S'), typeId: id, site: site2 }); else if (kind === 'RADAR') sv.radars.push({ id: newId('R'), typeId: id, site: rsite2 }); else sv.fleet.push({ id: newId('J'), typeId: id, base: base2 })
    store.persist(); audio.coin(); setMsg(`Bought ${kind === 'SAM' ? BATTERY_TYPES[id].short + ' — deployed at ' + SITE_MAP[site2].name : kind === 'RADAR' ? GROUND_RADARS[id].short + ' — built at ' + RADAR_SITE_MAP[rsite2].name : ASSET_TYPES[id].short + ' — based at ' + BASES.find((b) => b.icao === base2)!.name}${(kind === 'SAM' ? site : kind === 'RADAR' ? rsite : base) === 'AUTO' ? ' (best location)' : ''}`); store.notify()
  }
  return <div className="shop">
    <div className="tabs">{(['JET', 'SUPPORT', 'SAM', 'RADAR', 'UPGRADE'] as ItemKind[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'JET' ? 'INTERCEPTORS' : t === 'SUPPORT' ? 'TANKERS & AEW' : t === 'SAM' ? 'MISSILE BATTERIES' : t === 'RADAR' ? 'GROUND RADARS' : 'BASE UPGRADES'}</button>)}
      <span className="spacer" />
      {tab === 'RADAR' && <label>BUILD AT <select value={rsite} onChange={(e) => setRsite(e.target.value)}><option value="AUTO">AUTO — best location</option>{RADAR_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {tab !== 'UPGRADE' && tab !== 'SAM' && tab !== 'RADAR' && <label>DELIVER TO <select value={base} onChange={(e) => setBase(e.target.value)}><option value="AUTO">AUTO — best base</option>{BASES.map((b) => <option key={b.icao} value={b.icao}>{b.name}</option>)}</select></label>}
      {tab === 'SAM' && <label>DEPLOY AT <select value={site} onChange={(e) => setSite(e.target.value)}><option value="AUTO">AUTO — best location</option>{SAM_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    </div>
    {msg && <div className="toast">{msg}</div>}
    <div className="grid-cards">
      {tab !== 'UPGRADE' && ITEMS.filter((i) => i.kind === tab).map((i) => {
        const locked = lvl < i.level, owned = tab === 'SAM' ? sv.batteries.filter((b) => b.typeId === i.id).length : tab === 'RADAR' ? sv.radars.filter((r) => r.typeId === i.id).length : sv.fleet.filter((f) => f.typeId === i.id).length
        const t = tab === 'RADAR' ? undefined : ASSET_TYPES[i.id], b = BATTERY_TYPES[i.id], g = GROUND_RADARS[i.id]
        return <div key={i.id} className={`item-card ${locked ? 'locked' : ''}`}>
          <div className="ic-h"><b>{g?.short ?? t?.short ?? b.short}</b>{owned > 0 && <span className="owned">OWNED ×{owned}</span>}</div>
          <div className="dim">{i.name}</div><p>{i.blurb}</p>
          {!locked && <div className="dim small">→ {tab === 'SAM' ? SITE_MAP[site === 'AUTO' ? bestSamSite(sv, i.id) : site].name : tab === 'RADAR' ? RADAR_SITE_MAP[rsite === 'AUTO' ? bestRadarSite(sv, i.id) : rsite].name : BASES.find((b) => b.icao === (base === 'AUTO' ? bestBase(sv, i.id) : base))?.name}</div>}
          {t && <>{t.role === 'FIGHTER' ? <><STAT k="SPEED" v={t.maxKt} max={760} /><STAT k="RANGE" v={t.fuelCap / t.burnCruise} max={3.5} /><STAT k="RADAR" v={t.radar} max={100} /><STAT k="MISSILES" v={t.missiles} max={6} /><STAT k="HIT %" v={t.pk} max={1} /></> : <><STAT k="SPEED" v={t.maxKt} max={760} /><STAT k="ENDURANCE" v={t.fuelCap / t.burnCruise} max={12} />{t.offload > 0 && <STAT k="FUEL TO GIVE" v={t.offload} max={60000} />}{t.role === 'AEW' && <STAT k="RADAR" v={t.radar} max={220} />}</>}</>}
          {g && <><STAT k="RANGE" v={g.range} max={260} /><STAT k="LOW-LEVEL COVER" v={g.antennaFt} max={2600} /><STAT k="UPDATE RATE" v={12 - g.sweepSec} max={8} /></>}
          {b && <><STAT k="RANGE" v={b.range} max={45} /><STAT k="MISSILES" v={b.missiles} max={8} /><STAT k="RELOAD" v={140 - b.reloadSec} max={140} /><STAT k="HIT %" v={b.pk} max={1} /></>}
          <button className="buy" disabled={locked || sv.coins < i.price} onClick={() => buy(i.id, i.price, i.kind)}>{locked ? `🔒 LEVEL ${i.level}` : `BUY ◆ ${i.price.toLocaleString()}`}</button>
        </div>
      })}
      {tab === 'UPGRADE' && UPGRADES.map((u) => {
        const cur = sv.upgrades[u.id] ?? 0, price = u.prices[cur], locked = lvl < u.level
        return <div key={u.id} className={`item-card ${locked ? 'locked' : ''}`}>
          <div className="ic-h"><b>{u.name}</b><span className="owned">{'■'.repeat(cur)}{'□'.repeat(u.prices.length - cur)}</span></div><p>{u.blurb}</p>
          <button className="buy" disabled={locked || price === undefined || sv.coins < price} onClick={() => { sv.coins -= price; sv.upgrades[u.id] = cur + 1; store.persist(); audio.coin(); setMsg(`${u.name} upgraded to level ${cur + 1}`); store.notify() }}>{locked ? `🔒 LEVEL ${u.level}` : price === undefined ? 'MAXED' : `UPGRADE ◆ ${price.toLocaleString()}`}</button>
        </div>
      })}
    </div>
  </div>
}

function Hangar() {
  useStore((s) => s.version)
  const sv = store.save
  const change = () => { store.persist(); store.notify() }
  return <div className="hangar">
    <h2>HANGAR — YOUR AIRCRAFT</h2><p className="dim">Move aircraft between bases before a shift. Selling returns half the price.</p>
    <div className="row"><button className="auto-btn" onClick={() => { if (confirm('Spread all your aircraft, batteries and radars to the best locations?')) { autoArrange(sv); change(); audio.coin() } }}>AUTO-ARRANGE EVERYTHING</button><span className="dim"> Moves every jet, battery and radar to the spot where it adds the most cover.</span></div>
    <table className="tbl"><thead><tr><th>AIRCRAFT</th><th>ROLE</th><th>MISSILES</th><th>BASE</th><th></th></tr></thead><tbody>
      {sv.fleet.map((f) => { const t = ASSET_TYPES[f.typeId]; return <tr key={f.id}><td><b>{t.short}</b> <span className="dim">{t.name}</span></td><td>{t.role}</td><td>{t.missiles ? t.missiles + (sv.upgrades.missiles ?? 0) : '—'}</td>
        <td><select value={f.base} onChange={(e) => { f.base = e.target.value; change() }}>{BASES.map((b) => <option key={b.icao} value={b.icao}>{b.name}</option>)}</select></td>
        <td><button disabled={sv.fleet.filter((x) => ASSET_TYPES[x.typeId].role === 'FIGHTER').length <= 1 && t.role === 'FIGHTER'} onClick={() => { if (confirm(`Sell ${t.short} for ◆${sellPrice(f.typeId)}?`)) { sv.coins += sellPrice(f.typeId); sv.fleet = sv.fleet.filter((x) => x !== f); change() } }}>SELL ◆{sellPrice(f.typeId)}</button></td></tr> })}
    </tbody></table>
    <h2>MISSILE BATTERIES</h2>
    <table className="tbl"><thead><tr><th>BATTERY</th><th>RANGE</th><th>MISSILES</th><th>SITE</th><th></th></tr></thead><tbody>
      {sv.batteries.map((b) => { const t = BATTERY_TYPES[b.typeId]; return <tr key={b.id}><td><b>{t.short}</b> <span className="dim">{t.name}</span></td><td>{t.range} NM</td><td>{t.missiles}</td>
        <td><select value={b.site} onChange={(e) => { b.site = e.target.value; change() }}>{SAM_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
        <td><button onClick={() => { if (confirm(`Sell ${t.short} for ◆${sellPrice(b.typeId)}?`)) { sv.coins += sellPrice(b.typeId); sv.batteries = sv.batteries.filter((x) => x !== b); change() } }}>SELL ◆{sellPrice(b.typeId)}</button></td></tr> })}
    </tbody></table>
    {!sv.batteries.length && <p className="dim">No batteries. Buy one in the SHOP.</p>}
    <h2>GROUND RADARS</h2>
    {sv.radars.length > 0 ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>RADAR</th><th>RANGE</th><th>SITE</th><th></th></tr></thead><tbody>
      {sv.radars.map((r) => { const t = GROUND_RADARS[r.typeId]; return <tr key={r.id}><td><b>{t.short}</b> <span className="dim">{t.name}</span></td><td>{t.range} NM</td>
        <td><select value={r.site} onChange={(e) => { r.site = e.target.value; change() }}>{RADAR_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
        <td><button onClick={() => { if (confirm(`Sell ${t.short} for ◆${sellPrice(r.typeId)}?`)) { sv.coins += sellPrice(r.typeId); sv.radars = sv.radars.filter((x) => x !== r); change() } }}>SELL ◆{sellPrice(r.typeId)}</button></td></tr> })}
    </tbody></table></div> : <p className="dim">You rely on the eight RAF radar heads. Buy extra ground radars in the SHOP to fill gaps.</p>}
  </div>
}

function Stats() {
  const sv = store.save, s = sv.stats
  return <div className="stats">
    <h2>SERVICE RECORD</h2>
    <div className="cards">{[['SHIFTS', s.shifts], ['BANDITS DESTROYED', s.splashes], ['TURNED AWAY', s.complied], ['CORRECT IDS', s.ids], ['EMERGENCIES', s.emergencies], ['BEST SCORE', `${s.best} (${s.bestGrade})`], ['COINS EARNED', s.coinsEarned], ['BREACHES', s.breaches]].map(([k, v]) => <div className="card" key={k as string}><small>{k}</small><b>{v}</b></div>)}</div>
    <h2>MEDALS</h2>
    <div className="medals">{MEDALS.map((m) => <div key={m.id} className={`medal ${sv.medals.includes(m.id) ? 'got' : ''}`}><b>{sv.medals.includes(m.id) ? '★' : '☆'} {m.name}</b><span>{m.desc}</span></div>)}</div>
  </div>
}

function Settings() {
  const [voice, setVoice] = useState(false); const [code, setCode] = useState(''); const [msg, setMsg] = useState(''); const [promo, setPromo] = useState('')
  useStore((s) => s.version)
  const sv = store.save
  const set = (k: 'volume' | 'voice' | 'sfx', v: any) => { (sv.settings as any)[k] = v; store.persist(); store.applyAudio(); store.notify() }
  return <div className="settings">
    <h2>SETTINGS</h2>
    <div className="row"><span>VOLUME</span><input type="range" min={0} max={1} step={0.05} value={sv.settings.volume} onChange={(e) => set('volume', +e.target.value)} /></div>
    <div className="row"><span>RADIO VOICES</span><button onClick={() => set('voice', !sv.settings.voice)}>{sv.settings.voice ? 'ON' : 'OFF'}</button><button onClick={() => setVoice(true)}>ELEVENLABS VOICE…</button><span className="dim">{sv.settings.elevenKey ? 'ElevenLabs key saved' : 'Using browser voices'}</span></div>
    <div className="row"><span>ELEVENLABS</span><button disabled={!sv.settings.elevenKey} onClick={() => { sv.settings.elevenOn = !(sv.settings.elevenOn !== false); store.persist(); store.applyAudio(); audio.stopAll(); store.notify() }}>{sv.settings.elevenKey && sv.settings.elevenOn !== false ? 'ON' : 'OFF'}</button><span className="dim">{sv.settings.elevenKey ? 'When on, every radio line uses ElevenLabs' : 'Add a key with ELEVENLABS VOICE… first'}</span></div>
    <div className="row"><span>GRAPHICS</span>{(['AUTO', 'HIGH', 'FAST'] as const).map((m) => <button key={m} className={(sv.settings.quality ?? 'AUTO') === m ? 'on' : ''} onClick={() => { sv.settings.quality = m; store.persist(); store.notify() }}>{m}</button>)}<span className="dim">AUTO keeps it smooth by lowering resolution only if your machine struggles</span></div>
    <div className="row"><span>RADAR SWEEP ANIMATION</span><button onClick={() => { sv.settings.sweep = !sv.settings.sweep; store.persist(); store.notify() }}>{sv.settings.sweep ? 'ON' : 'OFF'}</button></div>
    <div className="row"><span>SAM RANGE RINGS</span>{(['AUTO', 'ALL', 'OFF'] as const).map((m) => <button key={m} className={(sv.settings.samRings ?? 'AUTO') === m ? 'on' : ''} onClick={() => { sv.settings.samRings = m; store.persist(); store.notify() }}>{m}</button>)}<span className="dim">AUTO shows a ring only when a hostile is near it or the battery is selected</span></div>
    <div className="row"><span>SOUND EFFECTS</span><button onClick={() => set('sfx', !sv.settings.sfx)}>{sv.settings.sfx ? 'ON' : 'OFF'}</button></div>
    <h2>REDEEM CODE</h2>
    <div className="row"><input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Enter code" style={{ fontSize: '1rem', padding: '.4rem', width: '16rem' }} /><button onClick={() => { const r = redeem(sv, promo); if (r.ok) { store.persist(); audio.coin(); setPromo('') } setMsg(r.text); store.notify() }}>REDEEM</button></div>
    <h2>SAVE GAME</h2>
    <p className="dim">Progress saves automatically in this browser after every shift and purchase. To move it to another device, copy the save code and paste it there.</p>
    <div className="row"><button onClick={() => { const c = exportSave(sv); setCode(c); navigator.clipboard?.writeText(c).then(() => setMsg('Save code copied to clipboard'), () => setMsg('Copy the code below')) }}>EXPORT SAVE CODE</button>
      <button onClick={() => { const s = importSave(code); if (!s) { setMsg('That save code is not valid'); return } s.settings.elevenKey = sv.settings.elevenKey; store.save = s; store.persist(); setMsg('Save loaded'); store.notify() }}>IMPORT FROM CODE</button>
      <button className="danger" onClick={() => { if (confirm('Delete all progress and start again?')) { const k = sv.settings.elevenKey; store.save = freshSave(); store.save.settings.elevenKey = k; writeSave(store.save); setMsg('Progress reset'); store.notify() } }}>RESET PROGRESS</button></div>
    <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="Save code appears here, or paste one to import" />
    {msg && <div className="toast">{msg}</div>}
    {voice && <VoiceSetup onClose={() => setVoice(false)} />}
  </div>
}

function Debrief() {
  const d = store.debrief; if (!d) return null
  const { scores, st, result, reward: r } = d
  const lvl = levelOf(store.save.xp)
  return <div className="modal"><div className="debrief-box">
    <div className="db-title">{r.mission ? (r.mission.stars > 0 ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED') : result === 'FAILED' ? 'AIRSPACE LOST' : result === 'COMPLETE' ? 'SHIFT COMPLETE' : 'SHIFT ENDED EARLY'}</div>
    {r.mission && <div className="mission-res"><div className="dim">{MISSION_MAP[r.mission.id].title}</div><div className="stars big">{[1, 2, 3].map((n) => <span key={n} className={n <= r.mission!.stars ? 'on' : ''}>★</span>)}</div>
      {st.objectives.map((o) => <div key={o.id} className={o.done ? 'g' : 'r'}>{o.done ? '✓' : '✗'} {o.text}</div>)}
      {r.mission.bonus > 0 && <div className="levelup">MISSION REWARD +{r.mission.bonus} ◆</div>}
      <div className="dim small">★ objectives met · ★★ and airspace ≥ 75% · ★★★ and score ≥ 80</div></div>}
    <div className="gradeline"><span className={`grade g${scores.grade}`}>{scores.grade}</span><div><div>SCORE {scores.overall}/100</div><div className="dim">Airspace held {st.airspace}% · {st.splashes} bandits destroyed</div></div></div>
    <table className="tbl"><tbody>
      <tr><td>Earned during shift</td><td className={r.base >= 0 ? 'coin' : 'r'}>{r.base >= 0 ? '+' : ''}{r.base} ◆</td></tr>
      <tr><td>Airspace bonus</td><td className="coin">+{r.airspaceBonus} ◆</td></tr>
      <tr><td>Grade bonus</td><td className="coin">+{r.gradeBonus} ◆</td></tr>
      {r.mission && r.mission.bonus > 0 && <tr><td>Mission reward</td><td className="coin">+{r.mission.bonus} ◆</td></tr>}
      <tr className="tot"><td>TOTAL</td><td className="coin">{r.total >= 0 ? '+' : ''}{r.total} ◆</td></tr>
      <tr><td>Experience</td><td>+{r.xp} XP</td></tr>
    </tbody></table>
    {r.levelAfter > r.levelBefore && <div className="levelup">PROMOTED! LEVEL {r.levelAfter} — {rankOf(r.levelAfter).toUpperCase()}. New items may be unlocked in the shop.</div>}
    {r.newMedals.map((m) => <div key={m} className="levelup">★ MEDAL: {m}</div>)}
    <div className="xp big"><i style={{ width: `${(lvl.into / lvl.need) * 100}%` }} /></div>
    <div className="grid2">{(['identification', 'awareness', 'resources', 'incidents'] as const).map((k) => <div className="kv" key={k}><span>{k.toUpperCase()}</span><b>{scores[k]}</b></div>)}</div>
    <div className="dim small">{st.coinLog.slice(-6).map((c, i) => <div key={i}>{c.n >= 0 ? '+' : ''}{c.n} · {c.why}</div>)}</div>
    <div className="db-btns"><button onClick={() => store.quit()}>HOME</button><button onClick={() => { store.quit(); store.setScreen('SHOP') }}>SHOP</button>
      {r.mission ? <><button onClick={() => { store.quit(); store.setScreen('CAMPAIGN') }}>CAMPAIGN</button><button onClick={() => store.startShift(r.mission!.id)}>RETRY</button>
        {(() => { const i = MISSIONS.findIndex((m) => m.id === r.mission!.id); const nx = MISSIONS[i + 1]; return nx && r.mission!.stars > 0 ? <button className="go" onClick={() => { store.quit(); store.pendingMission = nx.id; store.setScreen('CAMPAIGN') }}>NEXT MISSION ▶</button> : null })()}</>
        : <button className="go" onClick={() => store.startShift()}>NEXT SHIFT ▶</button>}</div>
  </div></div>
}

const unlocked = (i: number) => i === 0 || (store.save.campaign[MISSIONS[i - 1].id] ?? 0) > 0
function Campaign() {
  useStore((s) => s.version)
  const [sel, setSel] = useState<string | null>(store.pendingMission)
  useEffect(() => { store.pendingMission = null }, [])
  const sv = store.save
  const m = sel ? MISSION_MAP[sel] : null
  return <div className="campaign">
    <h2>CAMPAIGN — OPERATION NORTHERN SHIELD</h2>
    <p className="dim">Ten missions of rising difficulty. Earn at least one star to unlock the next. Your shop purchases and upgrades carry into every mission.</p>
    <div className="mission-grid">{MISSIONS.map((ms, i) => { const stars = sv.campaign[ms.id] ?? 0, open = unlocked(i); return (
      <button key={ms.id} className={`mission ${open ? '' : 'locked'} ${stars ? 'done' : ''}`} disabled={!open} onClick={() => { audio.ui(); setSel(ms.id) }}>
        <b>{ms.title}</b>
        <div className="stars">{[1, 2, 3].map((n) => <span key={n} className={n <= stars ? 'on' : ''}>★</span>)}</div>
        <span className="dim">{open ? ms.brief[0] : '🔒 Complete the previous mission'}</span>
        <span className="tags">{ms.hour >= 21 || ms.hour < 5 ? <i>NIGHT</i> : null}{ms.weather !== 'CLEAR' ? <i>{ms.weather}</i> : null}{ms.radarOff?.length ? <i>RADARS DOWN</i> : null}<i className="coin">◆ {ms.reward}</i></span>
      </button>) })}</div>
    {m && <MissionBrief m={m} onClose={() => setSel(null)} />}
  </div>
}
function MissionBrief({ m, onClose }: { m: Mission; onClose: () => void }) {
  return <div className="modal" onClick={onClose}><div className="debrief-box" onClick={(e) => e.stopPropagation()}>
    <div className="db-title">{m.title}</div>
    {m.brief.map((b, i) => <p key={i}>{b}</p>)}
    <h3 className="g">OBJECTIVES</h3>{m.objectives.map((o) => <div key={o.id}>○ {o.text}</div>)}
    <h3 className="y">ADVICE</h3><p>{m.tip}</p>
    <div className="dim small">{String(m.hour).padStart(2, '0')}00Z · {m.weather}{m.radarOff?.length ? ` · offline: ${m.radarOff.join(', ')}` : ''} · {m.minutes} sim-minutes · reward ◆{m.reward}</div>
    <div className="db-btns"><button onClick={onClose}>BACK</button><button onClick={() => { onClose(); store.setScreen('SHOP') }}>SHOP FIRST</button><button className="go" onClick={() => store.startShift(m.id)}>LAUNCH MISSION ▶</button></div>
  </div></div>
}

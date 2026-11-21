# SKY DEFENDER — UK Airspace Operations Simulator (1998)

Browser-based surveillance and airspace-operations simulation. You are the coordinator at a Control and Reporting Centre: maintain the Recognised Air Picture, identify contacts, handle incidents and manage aircraft, fuel and radar resources. Aircraft fly autonomously; you never pilot.

## Run
```bash
npm install
npm run dev        # develop
npm test           # simulation tests (vitest)
npm run build      # static output in dist/
```
**Cloudflare Pages:** build command `npm run build`, output directory `dist`. No server component; the simulation runs entirely client-side.

## Architecture
- `src/sim/` — pure TypeScript engine, no DOM. One `GameState`, deterministic 1 s tick, seeded RNG. Modules: flight model, civil traffic, radar network + tracker, identification, assets/logistics, operations, incidents/events/intel, scoring, scenarios.
- `src/ui/` — React workstation: canvas radar (own Mercator renderer over Natural Earth data, in place of Leaflet), movable/resizable/hideable panels (layout saved to localStorage), audio (Web Speech voices + synthesised tones).
- `scripts/build-geography.mjs` regenerates the coastline data.

## Modes
Arcade-style 10-minute shifts (40 sim-minutes at 4x) with progression:
- **Home / Shop / Hangar / Records / Settings.** Progress saves automatically in the browser (`localStorage`), with export/import save codes.
- **Shop:** 8 interceptors (Hawk → EF2000), tankers, E-3D, three SAM battery types placed at chosen sites, and upgrades (radar range, scramble speed, extra missiles, SAM reload). Items unlock by level.
- **Combat:** hostile raids head for bases and cities. Weapons stay tight until a target is confirmed hostile (a jet's visual ID, or refusal of a warning); civil aircraft can never be engaged. Interceptors and SAM batteries fire missiles with per-type range and hit chance. Raids that reach their target cost airspace integrity and coins.
- Optional ElevenLabs radio voices: VOICE button, paste your own API key (stored only in your browser).

## Notes
- Aircraft register: 440+ generated records; airways/fixes are invented but plausible, not real AIP data.
- Voice uses the browser's speech synthesis; voices vary by platform, and audio starts after the first click.
- Game state is not saved mid-watch; profile, records, unlocks and layout are.

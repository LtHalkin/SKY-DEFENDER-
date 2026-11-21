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
Quick Watch (simple arcade-style view, 10-minute shift), Combat Ready, Instant Action, Basic Training (5 lessons), Trade Training (8 unlockable scenarios with mentor), Sandbox.

## Notes
- Aircraft register: 440+ generated records; airways/fixes are invented but plausible, not real AIP data.
- Voice uses the browser's speech synthesis; voices vary by platform, and audio starts after the first click.
- Game state is not saved mid-watch; profile, records, unlocks and layout are.

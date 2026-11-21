import type { LatLon } from './geo'
import type { Rng } from './rng'

export type Category = 'UNKNOWN' | 'UNCORRELATED' | 'CORRELATED' | 'IDENTIFIED' | 'SUSPICIOUS' | 'UNRESOLVED'
export type Role = 'AIRLINER' | 'REGIONAL' | 'CARGO' | 'GA' | 'BIZJET' | 'OFFSHORE' | 'POLICE' | 'AMBULANCE' | 'COASTGUARD' | 'MIL' | 'FOREIGN' | 'PHENOM'
export type Intent =
  | 'normal' | 'commsFail' | 'emergency' | 'unlawful' | 'noPlan' | 'xpdrFault' | 'diverting' | 'cloned'
  | 'strayed' | 'foreignState' | 'phenomenon' | 'friendly' | 'vfrLocal' | 'hostile'
export interface Wp { name: string; lat: number; lon: number }

export interface Truth { intent: Intent; legit: boolean; note: string; benign: boolean }

export interface Xpdr {
  on: boolean; squawk: string; modeC: boolean; modeS: boolean
  msCallsign: string; msIcao24: string; iff4: boolean; identUntil: number
}
export type NavMode = 'ROUTE' | 'GOTO' | 'ORBIT' | 'TRAIL' | 'INTERCEPT' | 'LAND' | 'HOLD'
export interface Nav {
  mode: NavMode
  wps: Wp[]; wpi: number
  final: 'LAND' | 'REMOVE' | 'NONE'
  dest: string | null          // airport icao to land at
  orbit?: { c: LatLon; r: number }
  targetEntity?: string        // for TRAIL / INTERCEPT
  trailNm?: number
  speedOverride?: number
}
export interface Aircraft {
  id: string; kind: 'civil' | 'asset' | 'foreign' | 'phenomenon'
  callsign: string; reg: string; icao24: string; typeId: string; typeName: string; operator: string; role: Role
  lat: number; lon: number; alt: number; hdg: number; gs: number; vs: number
  tgtAlt: number; tgtSpd: number
  nav: Nav
  phase: 'PARKED' | 'DEPARTING' | 'ENROUTE' | 'ARRIVING' | 'ORBIT' | 'LANDED' | 'REMOVED'
  xpdr: Xpdr
  planId: string | null
  truth: Truth
  rcs: number
  emitter: 'WXR' | 'MIL' | 'NAV' | 'NONE'
  spawnedAt: number
  cruiseKt: number; maxAlt: number; climbFpm: number; turnRate: number
  emergency?: { kind: '7700' | '7600' | '7500'; since: number; divertTo?: string }
  deviateAt?: number
  hostile?: boolean; complied?: boolean; warnedAt?: number
  raid?: { name: string; lat: number; lon: number; value: number; breached?: boolean }
}

export interface FlightPlan {
  id: string; callsign: string; reg: string; typeId: string; typeName: string; rules: 'IFR' | 'VFR'
  dep: string; arr: string; route: Wp[]; rfl: number; tas: number; squawk: string
  etd: number; eta: number; status: 'FILED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' | 'NOT RECEIVED'
  remarks: string; aircraftId: string | null; operator: string; amended?: string
  held?: boolean // plan exists at area control but not yet distributed to RAP system
  role: Role; intent: Intent; hasXpdr: boolean
}

export interface Plot { t: number; lat: number; lon: number; alt: number | null; radar: string; gs?: number }
export interface Track {
  id: string; num: number; entityId: string
  created: number; lastPlot: number
  lat: number; lon: number; alt: number | null; altEst: boolean
  hdg: number; gs: number; vs: number
  plots: Plot[]
  sources: string[]
  quality: number
  coasting: boolean; dropped: boolean
  squawk: string | null
  ms: { callsign: string; icao24: string } | null
  iff4: boolean
  comint: string | null; esm: string | null
  category: Category
  manual: Category | null
  autoPlanId: string | null
  flags: string[]
  checks: { registry?: { t: number; ok: boolean; text: string }; atc?: { t: number; text: string; found: boolean }; interrogated?: boolean }
  vid?: { t: number; text: string; byAsset: string; ok: boolean }
  unknownSince: number | null
  lapsed?: boolean; lastSsr: number; flagsAtId?: string[]; idAt?: number; idBy?: string
  scored?: boolean
  intelLinks: string[]
  log: string[]
  watch: boolean
  hostile?: boolean; noReply?: boolean; complied?: boolean
}

export type RadarStatus = 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE'
export interface Radar {
  id: string; name: string; lat: number; lon: number; antennaFt: number
  primaryRange: number; secondaryRange: number; sweepSec: number; phase: number
  wxSens: number
  mask?: { from: number; to: number; factor: number } // terrain screening sector
  status: RadarStatus; condition: number; interference: number
  airborne?: string // asset id when this is an airborne platform
  angle: number
  hits: number; lastHit: number
  repairUntil: number; repairTeam: boolean
  forcedOffline?: boolean
  note: string
}
export interface WxCell { id: number; lat: number; lon: number; r: number; intensity: number; vx: number; vy: number }
export interface Weather { windDir: number; windKt: number; cells: WxCell[]; visibilityKm: number; severity: number; front: boolean; cloudBase: number }

export type AssetStatus = 'READY' | 'LAUNCHING' | 'AIRBORNE' | 'RETURNING' | 'TURNAROUND' | 'MAINT' | 'US'
export type Readiness = 'R5' | 'R30' | 'R60'
export interface Asset {
  id: string; tail: string; callsign: string; typeId: string; baseId: string; locationId: string | null
  status: AssetStatus; readiness: Readiness
  fuelKg: number; serviceHrs: number; flightHrs: number
  defect: string | null; busyUntil: number; opId: string | null
  cargo?: { kind: 'FUEL' | 'SPARES'; qty: number; to: string } | null
  launchAt?: number
  missiles: number; maxMissiles: number
  hold?: boolean
  bingoWarned?: boolean; lowWarned?: boolean
  ac: Aircraft | null
  sorties: number
}
export interface Airfield {
  icao: string; name: string; lat: number; lon: number
  fuelKg: number; fuelCap: number; spares: number; sparesCap: number
  bowsers: number; bowsersBusy: number; engineers: number; engineersBusy: number
  open: boolean; closedReason: string; hasRunwayLength: number
  alert: { kind: string; until: number } | null
}

export type OpType = 'IDENTIFY' | 'MONITOR' | 'SHADOW' | 'RETURN' | 'PATROL' | 'REFUEL' | 'FERRY' | 'SUPPLY' | 'ENGAGE'
export type OpStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETE' | 'ABORTED' | 'FAILED'
export interface Operation {
  id: string; type: OpType; status: OpStatus
  stages: string[]; stage: number
  assets: string[]
  trackId?: string; entityId?: string
  point?: LatLon; radius?: number; durationMin?: number; endsAt?: number
  fromBase?: string; toBase?: string; cargo?: { kind: 'FUEL' | 'SPARES'; qty: number }
  refuelFor?: string
  created: number; updated: number; log: string[]; result: string
  stageSince: number; data: Record<string, number | string | boolean>
}

export interface Message {
  id: number; t: number; channel: string; from: string; to: string; text: string
  voice: string; sev: 'ROUTINE' | 'PRIORITY' | 'URGENT'; ref?: string; refKind?: 'track' | 'op' | 'incident' | 'airfield' | 'intel' | 'asset' | 'radar'
  speak: boolean
}
export interface IntelReport {
  id: string; t: number; source: string; grade: string; text: string
  lat: number | null; lon: number | null; radius: number
  linkEntity: string | null; accuracy: 'ACCURATE' | 'PARTIAL' | 'MISLEADING' | 'FALSE'
  assessed: 'CREDIBLE' | 'DOUBTFUL' | 'DISREGARD' | null; assessedAt?: number; linkedTrack?: string; scored?: boolean
  incidentKind?: string
}
export type IncidentKind =
  | 'EMERGENCY_7700' | 'COMMS_7600' | 'UNLAWFUL_7500' | 'UNKNOWN_CONTACT' | 'PLAN_DEVIATION' | 'FOREIGN_STATE'
  | 'CLONED_ID' | 'XPDR_FAULT' | 'RADAR_FAULT' | 'ANOMALY' | 'SAR' | 'MISSING_PLAN' | 'STRAYED' | 'HOSTILE'
export interface Incident {
  id: string; kind: IncidentKind; title: string; severity: 1 | 2 | 3
  entityId: string | null; radarId?: string
  opened: number; closed: number | null
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FAILED' | 'STOOD DOWN'
  acked: boolean; ackedAt: number | null; actioned: boolean
  needs: string; result: string; log: string[]; deadline: number
}

export interface ScoreLedger {
  idCorrect: number; idWrong: number; falseAlarms: number; idLate: number
  incidentsHandled: number; incidentsFailed: number; incidentsTotal: number; ackLatencySum: number; ackCount: number
  intelCorrect: number; intelWrong: number
  unknownLapse: number
  fuelWasteKg: number; bingoEvents: number; opsCompleted: number; opsAborted: number; opsFailed: number
  maintLost: number; coverageGapSec: number; aircraftTracked: number
  emergencyMissed: number; undetected: number
  bonus: number
  log: string[]
}

export interface GameConfig {
  mode: 'COMBAT' | 'INSTANT' | 'BASIC' | 'TRADE' | 'SANDBOX'
  seed: number
  startHour: number
  traffic: number            // target airborne aircraft count scale 0.2..3
  weather: 'CLEAR' | 'RAIN' | 'STORM' | 'RANDOM'
  complexity: number         // 0..1 incident intensity multiplier
  radarOff: string[]
  incidents: boolean
  scenarioId?: string
  tension0: number
  prepSeconds: number
  maxAssetsDown: number
  growth: boolean            // difficulty ramps with sim time
  assetsEnabled: boolean
  radarFaults: boolean
  intel: boolean
  fastStart: boolean
  fleet?: { id: string; typeId: string; base: string }[]
  batteries?: { id: string; typeId: string; site: string }[]
  upgrades?: Record<string, number>
  hostiles?: boolean
  level?: number
}

export interface GameState {
  t: number                 // seconds since 00:00Z of day 0 (start hour * 3600 + elapsed)
  startT: number
  tick: number
  cfg: GameConfig
  rng: Rng
  nextId: number
  aircraft: Record<string, Aircraft>
  plans: Record<string, FlightPlan>
  squawkInUse: Set<string>
  tracks: Record<string, Track>
  trackByEntity: Record<string, string>
  trackNum: number
  radars: Radar[]
  weather: Weather
  assets: Record<string, Asset>
  airfields: Record<string, Airfield>
  ops: Record<string, Operation>
  messages: Message[]
  intel: IntelReport[]
  incidents: Incident[]
  score: ScoreLedger
  tension: number
  engineersFree: number; engineersTotal: number
  nextSpawn: number
  nextEvent: number
  nextIntel: number
  scheduled: { at: number; fn: string; args: any[] }[]
  pending: PendingIncident[]
  events: SimEvent[]        // transient event bus consumed by UI each frame
  ended: boolean
  paused: boolean
  objectives: Objective[]
  flags: Record<string, number | string | boolean>
  stats: { spawned: number; removed: number; maxTracks: number }
  batteries: Battery[]
  missiles: Missile[]
  airspace: number
  coins: number
  splashes: number
  coinLog: { t: number; n: number; why: string }[]
}
export interface Battery { id: string; typeId: string; name: string; site: string; lat: number; lon: number; range: number; missiles: number; maxMissiles: number; reloadSec: number; readyAt: number; pk: number; auto: boolean }
export interface Missile { id: number; lat: number; lon: number; alt: number; tgt: string; by: string; pk: number; speed: number; born: number; kind: 'AAM' | 'SAM'; trail: { lat: number; lon: number }[] }
export interface PendingIncident { entityId: string; kind: IncidentKind; title: string; severity: 1 | 2 | 3; needs: string; deadlineSec: number; announce: string; created: number; intent: Intent }
export interface Objective { id: string; text: string; done: boolean; failed: boolean; optional?: boolean; progress?: string }
export type SimEvent =
  | { type: 'msg'; msg: Message }
  | { type: 'alert'; text: string; sev: number }
  | { type: 'newTrack'; trackId: string }
  | { type: 'emergency'; trackId: string; code: string }
  | { type: 'ui'; name: string }
  | { type: 'fx'; kind: 'launch' | 'splash' | 'miss' | 'breach' | 'coins'; lat: number; lon: number; n?: number; text?: string }

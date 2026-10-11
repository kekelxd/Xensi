export const SPATIAL_HUNT_RULES = {
  roundCount: 8, audioProfileVersion: 1, distributionVersion: 1,
  sourceRadius: 6, eyeHeight: 1.65, horizontalFov: 103, spatialization: 'HRTF',
  orientationMs: 3000, fadeMs: 400, reducedFadeMs: 100, timeoutMs: 5000,
  revealMs: 1600, interRoundMs: 300, pulseSeconds: .12, pulseSpacingSeconds: .25,
  pulseCount: 3, jitterDegrees: 12, gain: .12,
} as const
export const SPATIAL_SECTORS = ['front','front-right','right','back-right','back','back-left','left','front-left'] as const
export type SpatialSector = typeof SPATIAL_SECTORS[number]
export type Direction3 = { x: number; y: number; z: number }
export type SpatialRound = {
  sector: SpatialSector; relativeAzimuth: number; referenceYaw: number; sourceAzimuth: number;
  responseAzimuth: number | null; responsePitch: number | null;
  angularErrorDeg: number; localizationTimeMs: number; timedOut: boolean;
}
export type SpatialMetrics = {
  mean_angular_error_deg: number | null; median_angular_error_deg: number | null;
  p95_angular_error_deg: number | null; best_angular_error_deg: number | null;
  mean_localization_time_ms: number | null; median_localization_time_ms: number | null;
  timeouts: number; round_count: number; rounds: SpatialRound[];
}
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let n = state
    n = Math.imul(n ^ n >>> 15, n | 1)
    n ^= n + Math.imul(n ^ n >>> 7, n | 61)
    return ((n ^ n >>> 14) >>> 0) / 4294967296
  }
}
export const wrapDegrees = (degrees: number) => (degrees % 360 + 360) % 360
export function circularAngleDifference(a: number, b: number) {
  return Math.abs((wrapDegrees(a - b) + 180) % 360 - 180)
}
export function generateSpatialDirections(seed: number) {
  const random = seededRandom(seed)
  const directions = SPATIAL_SECTORS.map((sector,i)=>({ sector, azimuth: i * 45 + (random()*2-1)*SPATIAL_HUNT_RULES.jitterDegrees }))
  for (let i=directions.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1)); [directions[i],directions[j]]=[directions[j],directions[i]]
  }
  return directions
}
// Y-up, forward -Z; positive azimuth turns right in both Three.js and Web Audio.
export function forwardDirection(yaw: number, pitch = 0): Direction3 {
  return { x: Math.sin(yaw)*Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw)*Math.cos(pitch) }
}
export function angularVectorError(a: Direction3, b: Direction3) {
  const lengths=Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z)
  if (!Number.isFinite(lengths) || lengths===0) throw new Error('Invalid direction')
  return Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y+a.z*b.z)/lengths)))*180/Math.PI
}
export function verticalFov(horizontalDegrees: number, aspect: number) {
  if (!Number.isFinite(aspect) || aspect<=0) throw new Error('Invalid aspect ratio')
  return 2*Math.atan(Math.tan(horizontalDegrees*Math.PI/360)/aspect)*180/Math.PI
}
export function summarizeSpatialRounds(rounds: readonly SpatialRound[]): SpatialMetrics {
  const errors=rounds.map(r=>r.angularErrorDeg).sort((a,b)=>a-b), times=rounds.map(r=>r.localizationTimeMs).sort((a,b)=>a-b)
  const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null
  const median=(values:number[])=>values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null
  return { mean_angular_error_deg: mean(errors), median_angular_error_deg: median(errors),
    p95_angular_error_deg: errors.length?errors[Math.ceil(errors.length*.95)-1]:null,
    best_angular_error_deg: errors.length?errors[0]:null, mean_localization_time_ms: mean(times),
    median_localization_time_ms: median(times), timeouts: rounds.filter(r=>r.timedOut).length,
    round_count: rounds.length, rounds: rounds.map(r=>({...r})) }
}
export function isSpatialMetrics(value: unknown): value is SpatialMetrics {
  if (!value || typeof value!=='object') return false
  const m=value as SpatialMetrics
  if (!Array.isArray(m.rounds) || m.rounds.length>8 || m.round_count!==m.rounds.length) return false
  if (!m.rounds.every(r=>r && SPATIAL_SECTORS.includes(r.sector) && typeof r.timedOut==='boolean'
    && [r.relativeAzimuth,r.referenceYaw,r.sourceAzimuth,r.angularErrorDeg,r.localizationTimeMs].every(Number.isFinite)
    && r.angularErrorDeg>=0 && r.angularErrorDeg<=180 && r.localizationTimeMs>=0 && r.localizationTimeMs<=5000
    && (r.timedOut ? r.responseAzimuth===null && r.responsePitch===null && r.angularErrorDeg===180 && r.localizationTimeMs===5000
      : typeof r.responseAzimuth==='number' && Number.isFinite(r.responseAzimuth) && typeof r.responsePitch==='number' && Number.isFinite(r.responsePitch)))) return false
  if (new Set(m.rounds.map(r=>r.sector)).size!==m.round_count) return false
  const computed=summarizeSpatialRounds(m.rounds)
  return Object.keys(computed).filter(k=>k!=='rounds').every(k=>{
    const key=k as Exclude<keyof SpatialMetrics,'rounds'>, a=m[key], b=computed[key]
    return a===b || typeof a==='number' && typeof b==='number' && Number.isFinite(a) && Math.abs(a-b)<1e-7
  })
}
export type SpatialPhase = 'idle'|'preparing'|'orientation'|'fading_out'|'blackout'|'stimulus'|'awaiting_response'|'revealing'|'inter_round'|'completed'|'interrupted'
export type SpatialView = { phase: SpatialPhase; round: number; countdown: number; result: SpatialRound|null }
export interface SpatialPorts {
  audioTime(): number
  cue(direction: Direction3): number
  stopAudio(): void
  orientation(): { yaw: number; pitch: number; forward: Direction3 }
  reveal(source: Direction3, response: Direction3|null): void
  hideSource(): void
  blackout(opacity: number): void
  changed(view: SpatialView): void
  sample(metrics: SpatialMetrics): void
  completed(metrics: SpatialMetrics): void
}
export class SpatialHuntController {
  phase: SpatialPhase='idle'
  readonly rounds: SpatialRound[]=[]
  readonly directions: ReturnType<typeof generateSpatialDirections>
  private entered=0
  private stimulusAt=0
  private countdown=-1
  private referenceYaw=0
  private sourceYaw=0
  private source:Direction3={x:0,y:0,z:-1}
  private fadeMs:number
  constructor(seed:number,private ports:SpatialPorts,reducedMotion=false) {
    this.directions=generateSpatialDirections(seed)
    this.fadeMs=reducedMotion?SPATIAL_HUNT_RULES.reducedFadeMs:SPATIAL_HUNT_RULES.fadeMs
  }
  start(now:number) { if (this.phase==='idle' || this.phase==='preparing') { this.ports.hideSource();this.enter('orientation',now) } }
  private enter(phase:SpatialPhase,now:number) {
    this.phase=phase;this.entered=now;this.countdown=-1
    this.ports.changed({phase,round:Math.min(8,this.rounds.length+(phase==='revealing'?0:1)),countdown:3,result:phase==='revealing'?this.rounds.at(-1)!:null})
  }
  tick(now:number) {
    const elapsed=now-this.entered
    if (this.phase==='orientation') {
      const countdown=Math.max(1,3-Math.floor(elapsed/1000))
      if (countdown!==this.countdown) { this.countdown=countdown;this.ports.changed({phase:this.phase,round:this.rounds.length+1,countdown,result:null}) }
      if (elapsed>=3000) this.enter('fading_out',now)
    } else if (this.phase==='fading_out') {
      this.ports.blackout(Math.min(1,elapsed/this.fadeMs))
      if (elapsed>=this.fadeMs) {
        this.ports.blackout(1)
        this.referenceYaw=this.ports.orientation().yaw
        this.sourceYaw=this.referenceYaw+this.directions[this.rounds.length].azimuth*Math.PI/180
        this.source=forwardDirection(this.sourceYaw)
        this.stimulusAt=this.ports.cue(this.source)
        this.enter('blackout',now)
      }
    } else if (this.phase==='blackout' && this.ports.audioTime()>=this.stimulusAt) this.enter('stimulus',now)
    else if (this.phase==='stimulus' || this.phase==='awaiting_response') {
      const audioElapsed=this.ports.audioTime()-this.stimulusAt
      if (audioElapsed>=5) this.respond(now,true)
      else if (this.phase==='stimulus' && audioElapsed>=.62) this.enter('awaiting_response',now)
    } else if (this.phase==='revealing') {
      this.ports.blackout(Math.max(0,1-elapsed/this.fadeMs))
      if (elapsed>=SPATIAL_HUNT_RULES.revealMs) {
        this.ports.hideSource()
        if (this.rounds.length===8) { this.enter('completed',now);this.ports.completed(summarizeSpatialRounds(this.rounds)) }
        else this.enter('inter_round',now)
      }
    } else if (this.phase==='inter_round' && elapsed>=SPATIAL_HUNT_RULES.interRoundMs) this.enter('orientation',now)
  }
  respond(now:number,timedOut=false) {
    if (!['blackout','stimulus','awaiting_response'].includes(this.phase) || this.ports.audioTime()<this.stimulusAt) return false
    timedOut = timedOut || (this.ports.audioTime() - this.stimulusAt) * 1000 >= SPATIAL_HUNT_RULES.timeoutMs
    const {yaw,pitch,forward}=this.ports.orientation()
    const direction=this.directions[this.rounds.length]
    const round:SpatialRound={ sector:direction.sector,relativeAzimuth:direction.azimuth,referenceYaw:wrapDegrees(this.referenceYaw*180/Math.PI),
      sourceAzimuth:wrapDegrees(this.sourceYaw*180/Math.PI),responseAzimuth:timedOut?null:wrapDegrees(yaw*180/Math.PI),responsePitch:timedOut?null:pitch*180/Math.PI,
      angularErrorDeg:timedOut?180:angularVectorError(forward,this.source), localizationTimeMs:timedOut?5000:Math.min(5000,Math.max(0,(this.ports.audioTime()-this.stimulusAt)*1000)), timedOut }
    this.rounds.push(round)
    this.ports.stopAudio();this.ports.reveal(this.source,timedOut?null:forward)
    this.ports.sample(summarizeSpatialRounds(this.rounds));this.enter('revealing',now)
    return true
  }
  interrupt(now:number) {
    if (['completed','interrupted','idle'].includes(this.phase)) return
    this.ports.stopAudio();this.ports.blackout(0);this.ports.hideSource();this.enter('interrupted',now)
  }
  get fullyBlack() { return ['blackout','stimulus','awaiting_response'].includes(this.phase) }
}

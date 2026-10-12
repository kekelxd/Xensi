import type { FixedWarmupDifficulty } from './warmupConfig'
import { RAGDOLL_SETTLE_SECONDS, regionForHit, type HitRegion } from './sniperRagdoll'

// opening: doorway width (m). radius: head radius (m); the whole silhouette scales with it. speed: run speed (m/s).
export const SNIPER_CONFIG = {
  easy: { opening: 2.0, radius: .14, speed: 4.0 },
  medium: { opening: 1.5, radius: .12, speed: 5.0 },
  hard: { opening: 1.1, radius: .10, speed: 6.2 },
} satisfies Record<FixedWarmupDifficulty, { opening: number; radius: number; speed: number }>

// World: meters, +X right, +Y up, the doorway faces -Z. The player stands still at the origin.
export const SNIPER_WORLD = {
  eyeHeight: 1.6,
  doorDistance: 9,
  doorHeight: 2.7,
  targetDistance: 22,
  distanceJitter: 3,
  referenceRadius: .12,
  unscopedSpreadDeg: 3.5,
  boltMs: 450,
} as const

// AWP-style zoom: vertical FOV derived from the 4:3 reference FOV (90 / 40 / 10), like CS.
export const SNIPER_SCOPES = [
  { fov43: 90, label: '1x' },
  { fov43: 40, label: '2x' },
  { fov43: 10, label: '4x' },
] as const
export type ScopeLevel = 0 | 1 | 2
export const scopeVerticalFov = (level: ScopeLevel) => 2 * Math.atan(Math.tan(SNIPER_SCOPES[level].fov43 * Math.PI / 360) / (4 / 3)) * 180 / Math.PI
// Sensitivity scales with the zoom angle so the cm/360 feel is kept (zoom_sensitivity_ratio = 1).
export const scopeSensitivityRatio = (level: ScopeLevel) => SNIPER_SCOPES[level].fov43 / SNIPER_SCOPES[0].fov43
export const nextScopeLevel = (level: ScopeLevel): ScopeLevel => ((level + 1) % SNIPER_SCOPES.length) as ScopeLevel

export type SniperOutcome = 'hit' | 'miss' | 'early' | 'noShot'
export type SniperZone = 'head' | 'body'
export type SniperAttempt = { outcome: SniperOutcome; stimulusVisibleAt: number | null; shotAt: number | null; reactionMs: number | null; zone?: SniperZone | null }
export type SniperAim = { yaw: number; pitch: number }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function sniperGeometry(radius: number) {
  const scale = radius / SNIPER_WORLD.referenceRadius
  return { headRadius: radius, bodyHalfWidth: .16 * scale, bodyTop: 1.45 * scale, headCenter: 1.45 * scale + radius * 1.05 }
}

// Ray from the eye (yaw to the right, pitch up, radians) through the doorway onto the runner's plane.
export function sniperShotDetail(config: { opening: number; radius: number }, target: { x: number; z: number }, aim: SniperAim): { zone: SniperZone; region: HitRegion } | null {
  const { eyeHeight, doorDistance, doorHeight } = SNIPER_WORLD
  const dx = Math.sin(aim.yaw) * Math.cos(aim.pitch), dy = Math.sin(aim.pitch), dz = -Math.cos(aim.yaw) * Math.cos(aim.pitch)
  if (dz >= -1e-6) return null
  const doorT = doorDistance / -dz
  const doorX = dx * doorT, doorY = eyeHeight + dy * doorT
  if (Math.abs(doorX) > config.opening / 2 || doorY < 0 || doorY > doorHeight) return null // the wall or lintel takes the shot
  const t = target.z / -dz
  const x = dx * t, y = eyeHeight + dy * t
  const body = sniperGeometry(config.radius)
  if (Math.hypot(x - target.x, y - body.headCenter) <= body.headRadius) return { zone: 'head', region: 'head' }
  if (Math.abs(x - target.x) <= body.bodyHalfWidth && y >= 0 && y <= body.bodyTop) return { zone: 'body', region: regionForHit('body', y / body.bodyTop) }
  return null
}
export const traceSniperShot = (config: { opening: number; radius: number }, target: { x: number; z: number }, aim: SniperAim): SniperZone | null => sniperShotDetail(config, target, aim)?.zone ?? null

// Time is monotonic active-session ms. The player never moves: only aim, scope and the trigger exist.
export class SniperReaction {
  phase: 'ready' | 'waiting' | 'peek' | 'feedback' | 'complete' = 'ready'
  attempts: SniperAttempt[] = []
  direction = 1
  x = 0
  z: number = SNIPER_WORLD.targetDistance
  visibleAt: number | null = null
  deadline = 0
  peekAt = 0
  speed = 0
  halfVisible = 0
  fallenAt: number | null = null
  hitRegion: HitRegion | null = null
  // The felled runner stays on the lane for a moment after the next attempt starts waiting.
  private corpse: { x: number; z: number; direction: number; region: HitRegion; since: number } | null = null
  readonly config
  constructor(difficulty: FixedWarmupDifficulty, private rng: () => number = Math.random) {
    this.config = SNIPER_CONFIG[difficulty]
  }
  // Half width of the slice of the runner's lane that is seen through the doorway.
  private laneHalfVisible() { return this.config.opening / 2 * this.z / SNIPER_WORLD.doorDistance }
  private laneX(now: number) {
    return this.direction * (-this.halfVisible - sniperGeometry(this.config.radius).bodyHalfWidth + (now - this.peekAt) / 1000 * this.speed)
  }
  update(now: number) {
    if (this.phase === 'complete') return
    if (this.phase === 'ready' || (this.phase === 'feedback' && now >= this.deadline)) {
      this.phase = 'waiting'
      this.visibleAt = null
      this.corpse = this.fallenAt !== null && this.hitRegion ? { x: this.x, z: this.z, direction: this.direction, region: this.hitRegion, since: this.fallenAt } : null
      this.fallenAt = null
      this.hitRegion = null
      this.peekAt = 0
      this.direction = this.rng() < .5 ? 1 : -1
      this.z = SNIPER_WORLD.targetDistance + (this.rng() - .5) * 2 * SNIPER_WORLD.distanceJitter
      this.halfVisible = this.laneHalfVisible()
      this.x = -this.direction * (this.halfVisible + sniperGeometry(this.config.radius).bodyHalfWidth)
      this.speed = this.config.speed * (.92 + this.rng() * .16)
      // 12% false windows extend the silent wait, without a cue or valid reaction.
      this.deadline = now + 700 + this.rng() * 2300 + (this.rng() < .12 ? 1000 + this.rng() * 1000 : 0)
    }
    if (this.phase === 'waiting' && now >= this.deadline) {
      this.phase = 'peek'
      this.peekAt = now
    }
    if (this.phase === 'peek') {
      this.x = this.laneX(now)
      // The first DRAWN frame with the runner's center inside the doorway exposes >=50% of the body.
      // Never backdate to an unseen internal spawn timestamp.
      if (this.visibleAt === null && Math.abs(this.x) <= this.halfVisible) this.visibleAt = now
      if (this.direction * this.x >= this.halfVisible + sniperGeometry(this.config.radius).bodyHalfWidth) this.finish('noShot', now)
    }
  }
  // Last rendered runner position for the 3D scene; keeps running through the shot feedback unless felled.
  renderState(now: number) {
    if ((this.phase === 'peek' || this.phase === 'feedback') && this.peekAt) {
      const felled = this.fallenAt !== null
      return { visible: true, x: felled ? this.x : this.laneX(now), z: this.z, direction: this.direction, fall: felled ? clamp01((now - this.fallenAt!) / 260) : 0,
        hit: felled && this.hitRegion ? { region: this.hitRegion, seconds: (now - this.fallenAt!) / 1000 } : null }
    }
    const corpse = this.phase === 'waiting' ? this.corpse : null
    if (corpse && (now - corpse.since) / 1000 < RAGDOLL_SETTLE_SECONDS + .4) {
      return { visible: true, x: corpse.x, z: corpse.z, direction: corpse.direction, fall: 1, hit: { region: corpse.region, seconds: (now - corpse.since) / 1000 } }
    }
    return { visible: false, x: this.x, z: this.z, direction: this.direction, fall: 0, hit: null as { region: HitRegion; seconds: number } | null }
  }
  shoot(now: number, aim: SniperAim, scoped: boolean) {
    if (this.phase !== 'waiting' && this.phase !== 'peek') return
    if (this.phase === 'peek' && this.direction * this.laneX(now) >= this.halfVisible + sniperGeometry(this.config.radius).bodyHalfWidth) {
      this.finish('noShot', now)
      return
    }
    if (this.visibleAt === null) { this.finish('early', now); return }
    // An unscoped bolt-action shot lands anywhere inside a wide cone; scoped and standing still it is exact.
    let shot = aim
    if (!scoped) {
      const spread = SNIPER_WORLD.unscopedSpreadDeg * Math.PI / 180 * Math.sqrt(this.rng()), angle = this.rng() * Math.PI * 2
      shot = { yaw: aim.yaw + Math.cos(angle) * spread, pitch: aim.pitch + Math.sin(angle) * spread }
    }
    const detail = sniperShotDetail(this.config, { x: this.laneX(now), z: this.z }, shot)
    if (detail) { this.x = this.laneX(now); this.fallenAt = now; this.hitRegion = detail.region }
    this.finish(detail ? 'hit' : 'miss', now, detail?.zone ?? null)
  }
  private finish(outcome: SniperOutcome, now: number, zone: SniperZone | null = null) {
    this.attempts.push({ outcome, stimulusVisibleAt: this.visibleAt, shotAt: outcome === 'noShot' ? null : now,
      reactionMs: this.visibleAt !== null && (outcome === 'hit' || outcome === 'miss') ? now - this.visibleAt : null, zone })
    this.phase = 'feedback'
    this.deadline = now + SNIPER_WORLD.boltMs
  }
  stop() { this.phase = 'complete' }
}

export function summarizeSniper(attempts: SniperAttempt[]) {
  const times = attempts.filter(a => a.outcome === 'hit').map(a => a.reactionMs!).sort((a, b) => a - b)
  const hits = times.length
  const misses = attempts.filter(a => a.outcome === 'miss').length
  const mean = hits ? times.reduce((sum, n) => sum + n, 0) / hits : 0
  // Population CV: 100 * (1 - standard deviation / mean), clamped to [0,100].
  // Fewer than two hits cannot establish consistency; return null rather than 100%.
  const deviation = hits ? Math.sqrt(times.reduce((sum, n) => sum + (n - mean) ** 2, 0) / hits) : 0
  return { hits, misses, shots: hits + misses, reactionTimeMs: mean,
    accuracy: hits + misses ? hits / (hits + misses) * 100 : 0,
    earlyShots: attempts.filter(a => a.outcome === 'early').length,
    noShots: attempts.filter(a => a.outcome === 'noShot').length,
    attempts: attempts.length,
    headshots: attempts.filter(a => a.outcome === 'hit' && a.zone === 'head').length,
    consistency: hits >= 2 && mean > 0 ? Math.max(0, 100 * (1 - deviation / mean)) : null,
    bestReactionMs: hits ? times[0] : null,
    medianReactionMs: hits ? (times[Math.floor((hits - 1) / 2)] + times[Math.floor(hits / 2)]) / 2 : null }
}

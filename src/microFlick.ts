import { createSeededRandom, createSessionSeed } from './calibrationPlan'
import { WARMUP_DIFFICULTIES, type FixedWarmupDifficulty } from './warmupConfig'

export const MICRO_FLICK_PB_REQUIREMENTS = { minAccuracy: 90, minHits: 5 } as const
export type MicroFlickRules = {
  radius: number; minRadius: number; maxRadius: number; referenceRadius: number
  timeoutMs: number; respawnMs: number
}
export function microFlickRules(difficulty: FixedWarmupDifficulty): MicroFlickRules {
  const distance = { easy: [.065, .10], medium: [.07, .12], hard: [.075, .145] }[difficulty]
  return { radius: .022 * WARMUP_DIFFICULTIES[difficulty].targetScale,
    minRadius: distance[0], maxRadius: distance[1], referenceRadius: .10,
    timeoutMs: 2000, respawnMs: WARMUP_DIFFICULTIES[difficulty].respawnMs }
}
type Point = { x: number; y: number }
export type MicroTarget = Point & { radius: number; reference: Point }

// Normalize by the shorter arena dimension, not its aspect ratio or pixel density.
// Each six-target block samples every distance stratum once, in shuffled order.
export function spawnMicroTarget(width: number, height: number, aim: Point, rules: MicroFlickRules,
  random: () => number, stratum: number): MicroTarget {
  if (!(width > 0 && height > 0)) throw new Error('Invalid Micro Flick arena')
  const scale = Math.min(width, height), center = { x: width / 2, y: height / 2 }
  const offset = { x: aim.x - center.x, y: aim.y - center.y }
  const blend = Math.min(1, rules.referenceRadius * scale / (Math.hypot(offset.x, offset.y) || 1))
  const reference = { x: center.x + offset.x * blend, y: center.y + offset.y * blend }
  const distance = scale * (rules.minRadius + (rules.maxRadius - rules.minRadius) * (stratum + random()) / 6)
  const radius = rules.radius * scale
  for (let attempt = 0; attempt < 32; attempt++) {
    const angle = random() * Math.PI * 2
    const next = { x: reference.x + Math.cos(angle) * distance, y: reference.y + Math.sin(angle) * distance }
    if (Math.hypot(next.x - aim.x, next.y - aim.y) > radius * 2
      && next.x >= radius && next.y >= radius && next.x <= width - radius && next.y <= height - radius) return { ...next, radius, reference }
  }
  // Guaranteed safe central geometry; choose the direction away from the actual aim.
  const angle = Math.atan2(reference.y - aim.y, reference.x - aim.x)
  return { x: reference.x + Math.cos(angle) * distance, y: reference.y + Math.sin(angle) * distance, radius, reference }
}

export class MicroFlick {
  readonly rules: MicroFlickRules
  readonly seed: number
  private random: () => number
  private strata: number[] = []
  target: MicroTarget | null = null
  visibleAt: number | null = null
  nextAt = 0
  stopped = false
  hits = 0
  misses = 0
  shots = 0
  timeouts = 0
  overshootCount = 0
  feedback: 'hit' | 'miss' | null = null
  feedbackUntil = 0
  private times: number[] = []
  private distanceTotal = 0
  private overshootTotal = 0
  private attemptOvershoot = 0
  private crossed = false
  private origin: Point = { x: 0, y: 0 }
  constructor(difficulty: FixedWarmupDifficulty, seed = createSessionSeed()) {
    this.seed = seed; this.random = createSeededRandom(seed); this.rules = microFlickRules(difficulty)
  }
  update(now: number, width: number, height: number, aim: Point) {
    if (this.stopped) return
    if (this.target && this.visibleAt !== null && now - this.visibleAt >= this.rules.timeoutMs) {
      this.misses++; this.timeouts++; this.finish(now, 'miss')
    }
    if (!this.target && now >= this.nextAt) {
      if (!this.strata.length) {
        this.strata = [0, 1, 2, 3, 4, 5]
        for (let i = 5; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [this.strata[i], this.strata[j]] = [this.strata[j], this.strata[i]] }
      }
      this.target = spawnMicroTarget(width, height, aim, this.rules, this.random, this.strata.pop()!)
      this.visibleAt = now; this.origin = { ...aim }; this.attemptOvershoot = 0; this.crossed = false
    }
    this.sampleAim(aim)
  }
  sampleAim(aim: Point) {
    if (this.target && !this.stopped) {
      const dx = this.target.x - this.origin.x, dy = this.target.y - this.origin.y, distance = Math.hypot(dx, dy)
      const projection = distance ? ((aim.x - this.origin.x) * dx + (aim.y - this.origin.y) * dy) / distance : 0
      const excess = Math.max(0, projection - distance - this.target.radius)
      if (excess > 0 && !this.crossed) { this.overshootCount++; this.crossed = true }
      this.attemptOvershoot = Math.max(this.attemptOvershoot, excess)
    }
  }
  shoot(now: number, aim: Point) {
    if (this.stopped) return
    this.shots++
    if (this.target && this.visibleAt !== null && now - this.visibleAt < this.rules.timeoutMs
      && Math.hypot(aim.x - this.target.x, aim.y - this.target.y) <= this.target.radius) {
      this.hits++; this.times.push(Math.max(0, now - this.visibleAt))
      this.distanceTotal += Math.hypot(this.target.x - this.origin.x, this.target.y - this.origin.y)
      this.finish(now, 'hit')
    } else {
      // A miss never skips a live target or restarts its acquisition clock.
      this.misses++; this.feedback = 'miss'; this.feedbackUntil = now + 100
    }
  }
  private finish(now: number, outcome: 'hit' | 'miss') {
    this.overshootTotal += this.attemptOvershoot
    this.target = null; this.visibleAt = null; this.nextAt = now + this.rules.respawnMs
    this.feedback = outcome; this.feedbackUntil = now + 100
  }
  stop() { this.stopped = true }
  summary(elapsedMs: number) {
    const sorted = [...this.times].sort((a, b) => a - b), n = sorted.length
    const mean = n ? sorted.reduce((sum, time) => sum + time, 0) / n : null
    const median = n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null
    const deviation = mean !== null && n ? Math.sqrt(sorted.reduce((sum, time) => sum + (time - mean) ** 2, 0) / n) : null
    return { hits: this.hits, misses: this.misses, shots: this.shots, timeouts: this.timeouts,
      accuracy: this.hits + this.misses ? this.hits / (this.hits + this.misses) * 100 : 0,
      targetsPerSecond: elapsedMs > 0 ? this.hits / (elapsedMs / 1000) : 0,
      meanAcquisitionTimeMs: mean, medianAcquisitionTimeMs: median,
      meanFlickDistancePx: this.hits ? this.distanceTotal / this.hits : null,
      meanOvershootPx: this.hits + this.timeouts ? this.overshootTotal / (this.hits + this.timeouts) : null,
      overshootCount: this.overshootCount,
      consistency: mean !== null && mean > 0 && n >= 2 ? Math.max(0, 100 * (1 - deviation! / mean)) : null }
  }
}
export type MicroFlickMetrics = ReturnType<MicroFlick['summary']>

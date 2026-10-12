import { describe, expect, it } from 'vitest'
import { nextScopeLevel, scopeSensitivityRatio, scopeVerticalFov, SNIPER_CONFIG, SNIPER_WORLD, SniperReaction, sniperGeometry, summarizeSniper, traceSniperShot, type SniperAttempt } from './sniperReaction'
import { createEmptyWarmupMetrics, readWarmupSession, writeWarmupSession } from './warmupTelemetry'

// Aim angles from the eye to a world point (z = distance in front of the eye).
const toward = (x: number, y: number, z: number) => ({ yaw: Math.atan2(x, z), pitch: Math.atan2(y - SNIPER_WORLD.eyeHeight, Math.hypot(x, z)) })
function peek(random = .5) {
  const engine = new SniperReaction('medium', () => random)
  engine.update(0)
  engine.update(engine.deadline)
  return engine
}
// First frame where the runner's center is inside the doorway.
function expose(engine: SniperReaction) {
  const travel = engine.halfVisible + sniperGeometry(engine.config.radius).bodyHalfWidth
  const time = engine.peekAt + travel / engine.speed * 1000 + 1
  engine.update(time)
  return time
}
const aimAt = (engine: SniperReaction, now: number, height: number) => toward(engine.renderState(now).x, height, engine.z)

describe('Sniper Reaction (first-person double door)', () => {
  it('waits until the seeded delay expires', () => {
    const engine = new SniperReaction('medium', () => .5)
    engine.update(0)
    expect(engine.deadline).toBe(1850)
    engine.update(1849)
    expect(engine.phase).toBe('waiting')
    engine.update(1850)
    expect(engine.phase).toBe('peek')
    expect(engine.visibleAt).toBeNull()
  })
  it.each([.2, .8])('crosses the lane in the seeded direction %s', random => {
    const engine = peek(random)
    const x = engine.x
    engine.update(engine.peekAt + 50)
    expect(Math.sign(engine.x - x)).toBe(random < .5 ? 1 : -1)
  })
  it('adds a false window without a stimulus', () => {
    const engine = new SniperReaction('easy', () => 0)
    engine.update(0)
    expect(engine.deadline).toBe(1700)
    engine.update(700)
    expect(engine.phase).toBe('waiting')
    expect(engine.visibleAt).toBeNull()
  })
  it('keeps the runner behind the wall until its center reaches the doorway', () => {
    const engine = peek()
    engine.update(engine.peekAt + 10)
    expect(engine.visibleAt).toBeNull()
    expect(Math.abs(engine.x)).toBeGreaterThan(engine.halfVisible)
    const visible = expose(engine)
    expect(engine.visibleAt).toBe(visible)
    expect(Math.abs(engine.x)).toBeLessThanOrEqual(engine.halfVisible)
  })
  it('projects the doorway onto the runner lane with similar triangles', () => {
    const engine = peek()
    expect(engine.halfVisible).toBeCloseTo(engine.config.opening / 2 * engine.z / SNIPER_WORLD.doorDistance)
  })
  it('hits a scoped shot on the body and times the reaction from exposure', () => {
    const engine = peek()
    const visible = expose(engine)
    engine.shoot(visible + 120, aimAt(engine, visible + 120, 1), true)
    expect(engine.attempts[0]).toMatchObject({ outcome: 'hit', zone: 'body', stimulusVisibleAt: visible, shotAt: visible + 120, reactionMs: 120 })
  })
  it('scores a headshot when the scoped crosshair is on the head', () => {
    const engine = peek()
    const visible = expose(engine)
    engine.shoot(visible + 100, aimAt(engine, visible + 100, sniperGeometry(engine.config.radius).headCenter), true)
    expect(engine.attempts[0]).toMatchObject({ outcome: 'hit', zone: 'head' })
    expect(summarizeSniper(engine.attempts).headshots).toBe(1)
  })
  it('records misses but excludes them from the valid hit reaction average', () => {
    const engine = peek()
    const visible = expose(engine)
    engine.shoot(visible + 100, { yaw: 0, pitch: .5 }, true)
    expect(engine.attempts[0].outcome).toBe('miss')
    expect(summarizeSniper(engine.attempts).reactionTimeMs).toBe(0)
  })
  it('spreads an unscoped shot away from the crosshair', () => {
    const engine = peek()
    const visible = expose(engine)
    engine.shoot(visible + 100, aimAt(engine, visible + 100, 1), false)
    expect(engine.attempts[0].outcome).toBe('miss')
  })
  it('never hits through the wall: a ray that misses the doorway is blocked', () => {
    const config = SNIPER_CONFIG.medium
    const target = { x: 0, z: SNIPER_WORLD.targetDistance }
    expect(traceSniperShot(config, target, toward(0, 1, target.z))).toBe('body')
    // Aim at a runner standing right behind the wall, outside the opening.
    const outsideX = config.opening * target.z / SNIPER_WORLD.doorDistance * .75
    expect(traceSniperShot(config, { x: outsideX, z: target.z }, toward(outsideX, 1, target.z))).toBeNull()
    expect(traceSniperShot(config, target, { yaw: Math.PI, pitch: 0 })).toBeNull()
  })
  it.each(['waiting', 'peek'])('classifies a shot before visual exposure as early (%s)', phase => {
    const engine = new SniperReaction('easy', () => .5)
    engine.update(0)
    if (phase === 'peek') engine.update(engine.deadline)
    engine.shoot(phase === 'peek' ? engine.peekAt : 10, { yaw: 0, pitch: 0 }, true)
    expect(engine.attempts[0].outcome).toBe('early')
    expect(engine.attempts[0].reactionMs).toBeNull()
    expect(summarizeSniper(engine.attempts).shots).toBe(0)
  })
  it('consumes the attempt after one shot and cycles the bolt through feedback', () => {
    const engine = peek()
    const time = expose(engine)
    const aim = aimAt(engine, time, 1)
    engine.shoot(time, aim, true)
    engine.shoot(time + 1, aim, true)
    engine.update(time + SNIPER_WORLD.boltMs - 1)
    expect(engine.phase).toBe('feedback')
    expect(engine.attempts).toHaveLength(1)
    engine.update(time + SNIPER_WORLD.boltMs)
    expect(engine.phase).toBe('waiting')
  })
  it('records no shot after the runner crosses, including late input between frames', () => {
    for (const lateShot of [false, true]) {
      const engine = peek()
      expose(engine)
      if (lateShot) engine.shoot(engine.peekAt + 4000, { yaw: 0, pitch: 0 }, true)
      else engine.update(engine.peekAt + 4000)
      expect(engine.attempts[0].outcome).toBe('noShot')
    }
  })
  it('freezes and fells the runner on a hit', () => {
    const engine = peek()
    const time = expose(engine)
    expect(engine.renderState(time)).toMatchObject({ visible: true, fall: 0 })
    engine.shoot(time, aimAt(engine, time, 1), true)
    expect(engine.renderState(time + 130).fall).toBeCloseTo(.5, 1)
    expect(engine.renderState(time + 400).x).toBe(engine.renderState(time + 100).x)
  })
  it('picks the ragdoll region from where the body was hit', () => {
    for (const [height, region] of [[1.0, 'chest'], [.2, 'legs']] as const) {
      const engine = peek()
      const time = expose(engine)
      engine.shoot(time, aimAt(engine, time, height), true)
      expect(engine.hitRegion).toBe(region)
      expect(engine.renderState(time + 100).hit).toMatchObject({ region })
    }
    const head = peek()
    const time = expose(head)
    head.shoot(time, aimAt(head, time, sniperGeometry(head.config.radius).headCenter), true)
    expect(head.hitRegion).toBe('head')
  })
  it('keeps the felled runner on the lane after the bolt cycles, then removes it', () => {
    const engine = peek()
    const time = expose(engine)
    engine.shoot(time, aimAt(engine, time, 1), true)
    engine.update(time + SNIPER_WORLD.boltMs)
    expect(engine.phase).toBe('waiting')
    expect(engine.renderState(time + 600)).toMatchObject({ visible: true, fall: 1 })
    expect(engine.renderState(time + 5000).visible).toBe(false)
  })
  it('calculates accuracy, median, best, headshots and population-CV consistency', () => {
    const attempts: SniperAttempt[] = [
      { outcome: 'hit', reactionMs: 100, stimulusVisibleAt: 0, shotAt: 100, zone: 'head' },
      { outcome: 'hit', reactionMs: 300, stimulusVisibleAt: 0, shotAt: 300, zone: 'body' },
      { outcome: 'miss', reactionMs: 900, stimulusVisibleAt: 0, shotAt: 900 },
      { outcome: 'early', reactionMs: null, stimulusVisibleAt: null, shotAt: 10 },
      { outcome: 'noShot', reactionMs: null, stimulusVisibleAt: 0, shotAt: null },
    ]
    expect(summarizeSniper(attempts)).toMatchObject({ reactionTimeMs: 200, medianReactionMs: 200, bestReactionMs: 100, consistency: 50, earlyShots: 1, noShots: 1, attempts: 5, headshots: 1 })
    expect(summarizeSniper(attempts).accuracy).toBeCloseTo(200 / 3)
    expect(summarizeSniper(attempts.slice(0, 1)).consistency).toBeNull()
  })
  it('narrows the doorway, shrinks the body and speeds the runner with difficulty', () => {
    expect(SNIPER_CONFIG.easy.opening).toBeGreaterThan(SNIPER_CONFIG.medium.opening)
    expect(SNIPER_CONFIG.medium.opening).toBeGreaterThan(SNIPER_CONFIG.hard.opening)
    expect(SNIPER_CONFIG.medium.radius).toBeGreaterThan(SNIPER_CONFIG.hard.radius)
    expect(SNIPER_CONFIG.easy.speed).toBeLessThan(SNIPER_CONFIG.medium.speed)
    expect(SNIPER_CONFIG.medium.speed).toBeLessThan(SNIPER_CONFIG.hard.speed)
  })
  it('scales field of view and sensitivity with the AWP zoom levels', () => {
    expect(scopeVerticalFov(0)).toBeCloseTo(73.74, 1)
    expect(scopeVerticalFov(1)).toBeLessThan(scopeVerticalFov(0))
    expect(scopeVerticalFov(2)).toBeLessThan(scopeVerticalFov(1))
    expect(scopeSensitivityRatio(0)).toBe(1)
    expect(scopeSensitivityRatio(1)).toBeCloseTo(40 / 90)
    expect(scopeSensitivityRatio(2)).toBeCloseTo(10 / 90)
    expect(([0, 1, 2] as const).map(nextScopeLevel)).toEqual([1, 2, 0])
  })
  it('stops all state progression on session completion', () => {
    const engine = peek()
    engine.stop()
    engine.update(100000)
    engine.shoot(100001, { yaw: 0, pitch: 0 }, true)
    expect(engine.phase).toBe('complete')
    expect(engine.attempts).toHaveLength(0)
  })
  it('persists mode-specific statistics with the existing storage contract', () => {
    const values = new Map<string, string>()
    const storage: Storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key) },
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
    const metrics = { ...createEmptyWarmupMetrics(60), sniper: summarizeSniper([]) }
    writeWarmupSession(storage, 'sniper-reaction', metrics)
    expect(readWarmupSession(storage, 'sniper-reaction')?.sniper).toEqual(metrics.sniper)
    expect(readWarmupSession(storage, 'reflex')).toBeNull()
  })
})

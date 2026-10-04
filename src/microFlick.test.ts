import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './calibrationPlan'
import { MicroFlick, microFlickRules, spawnMicroTarget } from './microFlick'
import { comparisonSignature, exerciseConfig, sessionMetrics, SESSION_REGISTRY } from './trainingSession'
import { derivePersonalBests, evaluatePersonalBest, getPersonalBestValue } from './personalBests'
import { makeSession } from './testFixtures/sessions'
import { createEmptyWarmupMetrics } from './warmupTelemetry'
import { createRoutineItem, supportsRoutineDifficulty, validateRoutine, createDefaultRoutine } from './routineConfig'

function microSession(value: number, order: number) {
  const session = makeSession(value, order, { exerciseId: 'micro_flick' })
  if (session.exerciseId !== 'micro_flick' || session.status !== 'completed') throw new Error('Micro fixture required')
  return session
}

describe('Micro Flick fair spawning and acquisition', () => {
  it.each([[1440, 900], [1366, 768], [900, 1440], [393, 800], [320, 200]])('keeps short spawns bounded and away from the crosshair at %sx%s', (width, height) => {
    const rules = microFlickRules('medium'), rng = createSeededRandom(77), scale = Math.min(width, height)
    const sectors = new Set<number>(), strata = new Set<number>()
    for (let i = 0; i < 600; i++) {
      const aim = { x: width / 2, y: height / 2 }
      const target = spawnMicroTarget(width, height, aim, rules, rng, i % 6)
      const distance = Math.hypot(target.x - aim.x, target.y - aim.y)
      expect(distance).toBeGreaterThanOrEqual(rules.minRadius * scale - 1e-9)
      expect(distance).toBeLessThanOrEqual(rules.maxRadius * scale + 1e-9)
      expect(distance).toBeGreaterThan(target.radius * 2)
      expect(target.x - target.radius).toBeGreaterThanOrEqual(0)
      expect(target.x + target.radius).toBeLessThanOrEqual(width)
      expect(target.y - target.radius).toBeGreaterThanOrEqual(0)
      expect(target.y + target.radius).toBeLessThanOrEqual(height)
      sectors.add(Math.floor((Math.atan2(target.y - aim.y, target.x - aim.x) + Math.PI) / (Math.PI / 4)))
      strata.add(Math.min(5, Math.floor((distance / scale - rules.minRadius) / (rules.maxRadius - rules.minRadius) * 6)))
    }
    expect(sectors.size).toBeGreaterThanOrEqual(8); expect(strata.size).toBe(6)
  })
  it('anchors near the center even when the aim is on an edge, without overlapping it', () => {
    const rules = microFlickRules('hard'), rng = createSeededRandom(100)
    for (const aim of [{ x: 0, y: 0 }, { x: 1440, y: 900 }, { x: 780, y: 500 }]) {
      const target = spawnMicroTarget(1440, 900, aim, rules, rng, 5)
      expect(Math.hypot(target.reference.x - 720, target.reference.y - 450)).toBeLessThanOrEqual(rules.referenceRadius * 900 + 1e-9)
      expect(Math.hypot(target.x - aim.x, target.y - aim.y)).toBeGreaterThan(target.radius * 2)
      expect(target.x + target.radius).toBeLessThan(1440); expect(target.y + target.radius).toBeLessThan(900)
    }
  })
  it('reproduces the same seeded sequence and samples all six distance tiers per block', () => {
    const a = new MicroFlick('medium', 41), b = new MicroFlick('medium', 41), tiers = new Set<number>()
    let now = 0
    for (let i = 0; i < 6; i++) {
      a.update(now, 1440, 900, { x: 720, y: 450 }); b.update(now, 1440, 900, { x: 720, y: 450 })
      expect(a.target).toEqual(b.target)
      const d = Math.hypot(a.target!.x - 720, a.target!.y - 450) / 900
      tiers.add(Math.floor((d - a.rules.minRadius) / (a.rules.maxRadius - a.rules.minRadius) * 6))
      a.shoot(now + 300, a.target!); b.shoot(now + 300, b.target!); now += 500
    }
    expect(tiers.size).toBe(6)
  })
  it('counts hits/misses and includes failed corrections in successful acquisition time', () => {
    const engine = new MicroFlick('medium', 1)
    engine.update(0, 1440, 900, { x: 720, y: 450 })
    const target = engine.target!
    engine.shoot(100, { x: 0, y: 0 })
    expect(engine.target).toBe(target); expect(engine.visibleAt).toBe(0)
    engine.shoot(300, target)
    engine.update(500, 1440, 900, target); engine.shoot(900, engine.target!)
    expect(engine.summary(1000)).toMatchObject({ hits: 2, misses: 1, shots: 3, accuracy: 2 / 3 * 100,
      meanAcquisitionTimeMs: 350, medianAcquisitionTimeMs: 350, targetsPerSecond: 2 })
    expect(engine.target).toBeNull()
  })
  it('counts timeouts against precision and never invents an acquisition value with no hits', () => {
    const engine = new MicroFlick('easy', 1)
    engine.update(0, 1440, 900, { x: 720, y: 450 }); engine.update(2000, 1440, 900, { x: 720, y: 450 })
    expect(engine.summary(2000)).toMatchObject({ hits: 0, misses: 1, timeouts: 1, shots: 0, accuracy: 0, meanAcquisitionTimeMs: null, medianAcquisitionTimeMs: null })
    engine.stop(); engine.update(3000, 1440, 900, { x: 720, y: 450 }); engine.shoot(3000, { x: 720, y: 450 })
    expect(engine.summary(3000).shots).toBe(0)
  })
  it('measures projected overshoot beyond the far target edge once per acquisition', () => {
    const engine = new MicroFlick('medium', 1), origin = { x: 720, y: 450 }
    engine.update(0, 1440, 900, origin)
    const target = engine.target!, dx = target.x - origin.x, dy = target.y - origin.y, distance = Math.hypot(dx, dy)
    const beyond = { x: target.x + dx / distance * (target.radius + 20), y: target.y + dy / distance * (target.radius + 20) }
    engine.sampleAim(beyond); engine.sampleAim(beyond); engine.shoot(300, target)
    expect(engine.summary(300).overshootCount).toBe(1)
    expect(engine.summary(300).meanOvershootPx).toBeCloseTo(20)
  })
})

describe('Micro Flick Sessions, PB and routine registration', () => {
  it('uses lower mean acquisition with a real precision/sample threshold and raw comparison', () => {
    const previous = microSession(284.4, 1)
    const next = microSession(284.2, 2)
    expect(SESSION_REGISTRY.micro_flick).toMatchObject({ primaryMetric: 'meanAcquisitionTimeMs', direction: 'lower', unit: 'milliseconds' })
    expect(evaluatePersonalBest(next, [previous])?.status).toBe('new')
    const weak = { ...next, metrics: { ...next.metrics, accuracy: 89.99 } }
    expect(getPersonalBestValue(weak)).toBeNull()
    expect(getPersonalBestValue({ ...next, metrics: { ...next.metrics, hits: 4 } })).toBeNull()
    expect(getPersonalBestValue({ ...next, metrics: { ...next.metrics, accuracy: Infinity } })).toBeNull()
    expect(derivePersonalBests([previous, weak], null)[0].sessionId).toBe(previous.id)
    expect(evaluatePersonalBest({ ...next, metrics: { ...next.metrics, meanAcquisitionTimeMs: previous.metrics.meanAcquisitionTimeMs } }, [previous])?.status).toBe('none')
  })
  it('signatures include actual geometry/rules but exclude seed, sensitivity and DPI', () => {
    const config = exerciseConfig('micro_flick', 'medium', 'medium', 60, 1440, 900, 'dot')
    expect(comparisonSignature('micro_flick', config)).toBe(comparisonSignature('micro_flick', { ...config, micro: { ...config.micro!, seed: 300 } }))
    for (const changed of [{ ...config, durationSeconds: 120 }, { ...config, input: 'controller' as const },
      { ...config, micro: { ...config.micro!, maxRadius: .13 } }, { ...config, micro: { ...config.micro!, radius: .019 } }]) {
      expect(comparisonSignature('micro_flick', changed)).not.toBe(comparisonSignature('micro_flick', config))
    }
    const engine = new MicroFlick('medium', 1); engine.update(0, 1440, 900, { x: 720, y: 450 }); engine.shoot(300, engine.target!)
    expect(sessionMetrics('micro_flick', { ...createEmptyWarmupMetrics(60), micro: engine.summary(60000) })).toMatchObject({ hits: 1, meanAcquisitionTimeMs: 300 })
    const routine = createDefaultRoutine(); routine.items = [createRoutineItem('micro_flick')]
    expect(validateRoutine(routine)).toEqual([]); expect(supportsRoutineDifficulty('micro_flick', 'adaptive')).toBe(false)
  })
})

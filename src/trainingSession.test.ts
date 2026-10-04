import { describe, expect, it } from 'vitest'
import { createSessionContext } from './playerProfileStore'
import { createEmptyWarmupMetrics } from './warmupTelemetry'
import { summarizeSniper } from './sniperReaction'
import { MicroFlick } from './microFlick'
import { evaluatePersonalBest } from './personalBests'
import { SessionRecorder } from './sessionRecorder'
import { comparisonSignature, exerciseConfig, SESSION_EXERCISES, SESSION_REGISTRY, type SessionReason } from './trainingSession'
import { parseCloudSession, sessionRow } from './sessionCloud'
import type { ActiveDocument, SessionDocument } from './sessionStorage'

function fixture() {
  let elapsed = 0
  const documents: SessionDocument[] = [], active: ActiveDocument[] = []
  const recorder = new SessionRecorder({ active: async doc => { active.push(structuredClone(doc)) }, append: async doc => { documents.push(structuredClone(doc)) } }, 'tab', () => elapsed, () => new Date(Date.UTC(2026, 9, 3) + elapsed).toISOString())
  const context = createSessionContext('cs2', .65, 800, crypto.randomUUID())
  const micro = new MicroFlick('medium', 1)
  micro.update(0, 1440, 900, { x: 720, y: 450 }); micro.shoot(300, micro.target!)
  const metrics = { ...createEmptyWarmupMetrics(60), remaining: 0, score: 100, accuracy: 50, hits: 1, shots: 2,
    onTargetMs: 30000, bestTrackingStreakMs: 1200, micro: micro.summary(60000), sniper: summarizeSniper([{ outcome: 'hit', stimulusVisibleAt: 1, shotAt: 301, reactionMs: 300 }]) }
  return { recorder, documents, active, context, metrics, advance: (ms: number) => { elapsed += ms } }
}
describe('Sessions V1 registry, snapshots and lifecycle', () => {
  it.each(SESSION_EXERCISES)('records %s with actual mode metrics, stable UUID and timing', exercise => {
    const f = fixture(), config = exerciseConfig(exercise, 'medium', 'medium', 60, 1440, 900, 'dot')
    const id = f.recorder.start(null, exercise, f.context, config)
    f.advance(60017)
    const result = f.recorder.complete(f.metrics)!
    expect(result).toMatchObject({ id, userId: null, status: 'completed', durationMs: 60017, schemaVersion: 1, exerciseVersion: 1 })
    expect(result.comparisonSignature).toBe(comparisonSignature(exercise, config))
    expect(result.metrics).toHaveProperty(SESSION_REGISTRY[exercise].primaryMetric)
    expect(f.recorder.complete(f.metrics)).toBeNull()
    expect(f.documents).toHaveLength(1)
    if (exercise === 'sniper-reaction') { expect(result.metrics).not.toHaveProperty('onTargetMs'); expect(result.metrics).toHaveProperty('reactionTimeMs', 300) }
    if (exercise === 'tracking') expect(result.metrics).not.toHaveProperty('shots')
  })
  it('keeps sensitivity changes comparable and separates configuration/version/duration changes', () => {
    const f = fixture(), cfg = exerciseConfig('flick', 'medium', 'medium', 60, 1440, 900, 'dot')
    f.recorder.start(null, 'flick', f.context, cfg); const first = f.recorder.complete(f.metrics)!
    f.recorder.start(null, 'flick', { ...f.context, gameId: 'valorant', sensitivity: .4, dpi: 1600 }, cfg); const second = f.recorder.complete(f.metrics)!
    expect(first.comparisonSignature).toBe(second.comparisonSignature)
    for (const changed of [{ ...cfg, durationSeconds: 120 }, { ...cfg, targetScale: 2 }, { ...cfg, arenaWidth: 800 }, { ...cfg, targetCount: 4 }]) expect(comparisonSignature('flick', changed)).not.toBe(first.comparisonSignature)
    expect(comparisonSignature('flick', cfg, 2)).not.toBe(first.comparisonSignature)
    expect(SESSION_REGISTRY['sniper-reaction']).toMatchObject({ primaryMetric: 'bestReactionMs', direction: 'lower' })
  })
  it.each<SessionReason>(['escape', 'pointer_lock_lost', 'visibility_hidden', 'configuration_changed'])('retains invalid %s sessions but never awards PB', reason => {
    const f = fixture()
    f.recorder.start(null, 'flick', f.context, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
    f.recorder.invalidate(reason); f.advance(60000)
    const saved = f.recorder.complete(f.metrics)!
    expect(saved).toMatchObject({ status: 'invalid', invalidReason: reason })
    expect(evaluatePersonalBest(saved, [])).toBeNull()
  })
  it('captures snapshots and groups N sessions under one run without combining scores', () => {
    const f = fixture(), routineId = crypto.randomUUID(), stepId = crypto.randomUUID()
    const runId = f.recorder.beginRun('account-a', routineId, 'Routine before edit')
    const config = exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot')
    f.recorder.start('account-a', 'flick', f.context, config, stepId)
    f.context.sensitivity = 2; config.targetScale = 5
    f.advance(60000); const first = f.recorder.complete(f.metrics)!
    f.recorder.start('account-a', 'tracking', f.context, config, crypto.randomUUID())
    f.advance(60000); const second = f.recorder.complete(f.metrics)!
    const run = f.recorder.finishRun()!
    expect(first.context?.sensitivity).toBe(.65); expect(first.config?.targetScale).not.toBe(5)
    expect([first.routineRunId, second.routineRunId, run.id]).toEqual([runId, runId, runId])
    expect(run).toMatchObject({ routineName: 'Routine before edit', durationMs: 120000, status: 'completed' })
    expect(run).not.toHaveProperty('score')
  })
  it('persists partial interrupted metrics for the captured owner and finishes interrupted runs', () => {
    const f = fixture()
    f.recorder.beginRun('account-a', crypto.randomUUID(), 'Partial')
    f.recorder.start('account-a', 'tracking', f.context, exerciseConfig('tracking', 'easy', 'easy', 60, 1000, 600, 'dot'))
    f.recorder.sample(f.metrics); f.advance(2100)
    const session = f.recorder.abort('account_changed')!, run = f.recorder.finishRun('interrupted', 'account_changed')!
    expect(session).toMatchObject({ userId: 'account-a', status: 'interrupted', durationMs: 2100, invalidReason: 'account_changed' })
    expect(run.status).toBe('interrupted'); expect(f.recorder.abort('navigation')).toBeNull()
  })
  it('rejects wrong owners and malformed remote results instead of fabricating missing metrics', () => {
    const f = fixture(), owner = crypto.randomUUID()
    f.recorder.start(owner, 'flick', f.context, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
    const saved = f.recorder.complete(f.metrics)!, r = sessionRow(saved)
    expect(parseCloudSession(r, owner)).toEqual(saved)
    expect(() => parseCloudSession(r, crypto.randomUUID())).toThrow()
    expect(() => parseCloudSession({ ...r, metrics: {} }, owner)).toThrow()
    expect(() => parseCloudSession({ ...r, metrics: { score: Infinity } }, owner)).toThrow()
  })
})

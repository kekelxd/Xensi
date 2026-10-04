import { comparisonSignature, exerciseConfig, sessionMetrics, type TrainingSession } from '../trainingSession'
import { createEmptyWarmupMetrics } from '../warmupTelemetry'
import { summarizeSniper } from '../sniperReaction'

export const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export function makeSession(value: number, order = 1, patch: Partial<TrainingSession> = {}): TrainingSession {
  const exerciseId = patch.exerciseId ?? 'flick'
  const config = patch.config ?? exerciseConfig(exerciseId, 'medium', 'medium', 60, 1440, 900, 'dot')
  const exerciseVersion = patch.exerciseVersion ?? 1
  const finishedAt = new Date(Date.UTC(2026, 9, 1, 12, order)).toISOString()
  const metrics = sessionMetrics(exerciseId, { ...createEmptyWarmupMetrics(60), remaining: 0, score: value, accuracy: value,
    ...(exerciseId === 'micro_flick' ? { micro: { hits: 6, misses: 0, shots: 6, timeouts: 0, accuracy: 100, targetsPerSecond: .1,
      meanAcquisitionTimeMs: value, medianAcquisitionTimeMs: value, meanFlickDistancePx: 70, meanOvershootPx: 0, overshootCount: 0, consistency: 100 } } : {}),
    sniper: summarizeSniper([{ outcome: 'hit', stimulusVisibleAt: 1, shotAt: value + 1, reactionMs: value }]) })
  return { id: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`, userId: null, exerciseId,
    startedAt: new Date(Date.parse(finishedAt) - 60000).toISOString(), finishedAt, durationMs: 60000,
    status: 'completed', invalidReason: null, routineRunId: null, routineId: null, routineStepId: null, presetId: null,
    context: { gameId: 'cs2', sensitivity: 1, dpi: 800 }, config, metrics,
    comparisonSignature: comparisonSignature(exerciseId, config, exerciseVersion), schemaVersion: 1, exerciseVersion, ...patch } as TrainingSession
}

import type { SessionContext } from './playerProfileStore'
import { SNIPER_CONFIG, type summarizeSniper } from './sniperReaction'
import { WARMUP_DIFFICULTIES, type FixedWarmupDifficulty, type WarmupDifficulty, type WarmupExercise } from './warmupConfig'
import { createEmptyWarmupMetrics, type WarmupMetrics, type WarmupSessionSummary } from './warmupTelemetry'
import { microFlickRules, MICRO_FLICK_PB_REQUIREMENTS, type MicroFlickRules, type MicroFlickMetrics } from './microFlick'

export const SESSION_EXERCISES: WarmupExercise[] = ['switch', 'tracking', 'flick', 'reflex', 'gridshot', 'strafetrack', 'sniper-reaction', 'micro_flick']
export type SessionReason = 'pointer_lock_lost' | 'escape' | 'visibility_hidden' | 'manual_abort' | 'navigation' | 'account_changed' | 'page_reload' | 'legacy_unverified' | 'configuration_changed'
export type SessionStatus = 'completed' | 'invalid' | 'interrupted'
export type ExerciseConfig = {
  difficulty: WarmupDifficulty; effectiveDifficulty: FixedWarmupDifficulty; durationSeconds: number
  arenaWidth: number; arenaHeight: number; input: 'mouse-pointer-lock' | 'controller'; crosshair: string
  targetScale: number; targetSpeed: number; dwellMs: number; respawnMs: number; targetCount: number
  sniper?: { opening: number; radius: number; speed: number }
  micro?: MicroFlickRules & { seed?: number }
}
type AimMetrics = Pick<WarmupMetrics, 'accuracy' | 'reactionTimeMs' | 'overshootCount' | 'correctionCount' | 'aimBiasX' | 'aimBiasY'>
export type MetricsByExercise = {
  switch: AimMetrics & Pick<WarmupMetrics, 'score' | 'onTargetMs' | 'hits' | 'bestStreak'>
  tracking: AimMetrics & Pick<WarmupMetrics, 'onTargetMs' | 'bestTrackingStreakMs'>
  strafetrack: MetricsByExercise['tracking']
  flick: AimMetrics & Pick<WarmupMetrics, 'score' | 'hits' | 'shots' | 'clickErrors' | 'bestStreak'>
  reflex: MetricsByExercise['flick']
  gridshot: MetricsByExercise['flick']
  'sniper-reaction': ReturnType<typeof summarizeSniper>
  micro_flick: MicroFlickMetrics
}
type SessionBase = {
  id: string; userId: string | null; startedAt: string; finishedAt: string; durationMs: number
  status: SessionStatus; invalidReason: SessionReason | null
  routineRunId: string | null; routineId: string | null; routineStepId: string | null; presetId: string | null
  context: (SessionContext & { routine?: { id: string | null; name: string; stepId: string | null } }) | null
  config: ExerciseConfig | null; comparisonSignature: string | null
  schemaVersion: 1; exerciseVersion: number
}
export type TrainingSession = { [E in WarmupExercise]: SessionBase & { exerciseId: E } & (
  { status: 'completed'; metrics: MetricsByExercise[E] } |
  { status: 'invalid' | 'interrupted'; metrics: Partial<MetricsByExercise[E]> | null }
) }[WarmupExercise]
export type RoutineRun = {
  id: string; userId: string | null; routineId: string | null; routineName: string
  startedAt: string; finishedAt: string | null; durationMs: number
  status: 'running' | SessionStatus; invalidReason: SessionReason | null; schemaVersion: 1
}
export type ExerciseMetricDefinition = {
  primaryMetric: 'score' | 'accuracy' | 'bestReactionMs' | 'meanAcquisitionTimeMs'
  unit: 'points' | 'percent' | 'milliseconds'
  direction: 'higher' | 'lower'
  precision: number
  exerciseVersion: number
  pbSupported: boolean
  pbRequirements?: { minAccuracy: number; minHits: number }
}
export const SESSION_REGISTRY: Record<WarmupExercise, ExerciseMetricDefinition> = {
  switch: { primaryMetric: 'score', unit: 'points', direction: 'higher', precision: 0, exerciseVersion: 1, pbSupported: true },
  tracking: { primaryMetric: 'accuracy', unit: 'percent', direction: 'higher', precision: 1, exerciseVersion: 1, pbSupported: true },
  flick: { primaryMetric: 'score', unit: 'points', direction: 'higher', precision: 0, exerciseVersion: 1, pbSupported: true },
  reflex: { primaryMetric: 'score', unit: 'points', direction: 'higher', precision: 0, exerciseVersion: 1, pbSupported: true },
  gridshot: { primaryMetric: 'score', unit: 'points', direction: 'higher', precision: 0, exerciseVersion: 1, pbSupported: true },
  strafetrack: { primaryMetric: 'accuracy', unit: 'percent', direction: 'higher', precision: 1, exerciseVersion: 1, pbSupported: true },
  'sniper-reaction': { primaryMetric: 'bestReactionMs', unit: 'milliseconds', direction: 'lower', precision: 0, exerciseVersion: 1, pbSupported: true },
  micro_flick: { primaryMetric: 'meanAcquisitionTimeMs', unit: 'milliseconds', direction: 'lower', precision: 0, exerciseVersion: 1, pbSupported: true, pbRequirements: MICRO_FLICK_PB_REQUIREMENTS },
}

export function exerciseConfig(exercise: WarmupExercise, difficulty: WarmupDifficulty, effectiveDifficulty: FixedWarmupDifficulty, durationSeconds: number, width: number, height: number, crosshair: string): ExerciseConfig {
  return { difficulty, effectiveDifficulty, durationSeconds, arenaWidth: Math.round(width), arenaHeight: Math.round(height),
    input: 'mouse-pointer-lock', crosshair, ...WARMUP_DIFFICULTIES[effectiveDifficulty], targetCount: exercise === 'gridshot' ? 3 : 1,
    ...(exercise === 'sniper-reaction' ? { sniper: { ...SNIPER_CONFIG[effectiveDifficulty] } } : {}),
    ...(exercise === 'micro_flick' ? { micro: microFlickRules(effectiveDifficulty) } : {}) }
}
// Explicitly ordered configuration, not mutable preset identity or sensitivity, defines compatibility.
export function comparisonSignature(exercise: WarmupExercise, config: ExerciseConfig, exerciseVersion = 1) {
  return JSON.stringify([exercise, exerciseVersion, config.durationSeconds, config.difficulty, config.effectiveDifficulty,
    config.arenaWidth, config.arenaHeight, config.input, config.crosshair, config.targetCount,
    ...(exercise === 'micro_flick' ? [config.micro?.radius, config.micro?.minRadius, config.micro?.maxRadius,
      config.micro?.referenceRadius, config.micro?.timeoutMs, config.micro?.respawnMs,
      MICRO_FLICK_PB_REQUIREMENTS.minAccuracy, MICRO_FLICK_PB_REQUIREMENTS.minHits] : exercise === 'sniper-reaction' ? [config.sniper?.opening, config.sniper?.radius, config.sniper?.speed] :
      [config.targetScale, config.targetSpeed, config.dwellMs, config.respawnMs])])
}
export function sessionMetrics<E extends WarmupExercise>(exercise: E, m: WarmupMetrics): MetricsByExercise[E] | null {
  if (exercise === 'micro_flick') return (m.micro ? { ...m.micro } : null) as MetricsByExercise[E] | null
  if (exercise === 'sniper-reaction') return (m.sniper ? { ...m.sniper } : null) as MetricsByExercise[E] | null
  const aim: AimMetrics = { accuracy: m.accuracy, reactionTimeMs: m.reactionTimeMs, overshootCount: m.overshootCount,
    correctionCount: m.correctionCount, ...(m.aimBiasX !== undefined ? { aimBiasX: m.aimBiasX } : {}), ...(m.aimBiasY !== undefined ? { aimBiasY: m.aimBiasY } : {}) }
  if (exercise === 'tracking' || exercise === 'strafetrack') return { ...aim, onTargetMs: m.onTargetMs, bestTrackingStreakMs: m.bestTrackingStreakMs } as MetricsByExercise[E]
  if (exercise === 'switch') return { ...aim, score: m.score, onTargetMs: m.onTargetMs, hits: m.hits, bestStreak: m.bestStreak } as MetricsByExercise[E]
  return { ...aim, score: m.score, hits: m.hits, shots: m.shots, clickErrors: m.clickErrors, bestStreak: m.bestStreak } as MetricsByExercise[E]
}
export function sessionSummary(session: TrainingSession): WarmupSessionSummary | null {
  if (!session.metrics) return null
  const base = { ...createEmptyWarmupMetrics(0), ...session.metrics, completedAt: session.finishedAt,
    sessionStatus: session.status, comparisonSignature: session.comparisonSignature ?? undefined,
    ...(session.context ? { sessionContext: session.context } : {}),
    ...(session.exerciseId === 'sniper-reaction' && session.status === 'completed' ? { sniper: session.metrics, score: session.metrics.hits * 100, clickErrors: session.metrics.misses } : {}) }
  if (session.exerciseId === 'micro_flick') return { ...base, micro: session.metrics as MicroFlickMetrics,
    reactionTimeMs: session.metrics.meanAcquisitionTimeMs ?? 0, clickErrors: session.metrics.misses ?? 0 }
  return base
}

import type { WarmupExercise } from './warmupConfig'
import type { summarizeSniper } from './sniperReaction'
import type { SessionContext } from './playerProfileStore'
import type { MicroFlickMetrics } from './microFlick'

export type WarmupMetrics = {
  sessionStatus?: 'completed' | 'invalid' | 'interrupted'
  comparisonSignature?: string
  completedAt?: string
  sessionContext?: SessionContext
  sniper?: ReturnType<typeof summarizeSniper>
  micro?: MicroFlickMetrics
  score: number
  accuracy: number
  hits: number
  shots: number
  remaining: number
  onTargetMs: number
  reactionTimeMs: number
  clickErrors: number
  bestStreak: number
  bestTrackingStreakMs: number
  overshootCount: number
  correctionCount: number
  aimBiasX?: number
  aimBiasY?: number
}

export type WarmupSessionSummary = Omit<WarmupMetrics, 'remaining'>
type StoredWarmupSession = WarmupSessionSummary & { history?: WarmupSessionSummary[] }

export function createEmptyWarmupMetrics(duration: number): WarmupMetrics {
  return {
    score: 0,
    accuracy: 0,
    hits: 0,
    shots: 0,
    remaining: duration,
    onTargetMs: 0,
    reactionTimeMs: 0,
    clickErrors: 0,
    bestStreak: 0,
    bestTrackingStreakMs: 0,
    overshootCount: 0,
    correctionCount: 0,
    aimBiasX: 0,
    aimBiasY: 0,
  }
}

export function getAimBiasLabel(x = 0, y = 0) {
  if (Math.hypot(x, y) < .012) return 'Centrada'
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'Direita' : 'Esquerda'
  return y > 0 ? 'Abaixo' : 'Acima'
}

export function toWarmupSessionSummary(metrics: WarmupMetrics): WarmupSessionSummary {
  return {
    completedAt: metrics.completedAt ?? new Date().toISOString(),
    ...(metrics.sessionStatus ? { sessionStatus: metrics.sessionStatus } : {}),
    ...(metrics.comparisonSignature ? { comparisonSignature: metrics.comparisonSignature } : {}),
    ...(metrics.sessionContext ? { sessionContext: { ...metrics.sessionContext } } : {}),
    ...(metrics.sniper ? { sniper: metrics.sniper } : {}),
    ...(metrics.micro ? { micro: metrics.micro } : {}),
    score: metrics.score,
    accuracy: metrics.accuracy,
    hits: metrics.hits,
    shots: metrics.shots,
    onTargetMs: metrics.onTargetMs,
    reactionTimeMs: metrics.reactionTimeMs,
    clickErrors: metrics.clickErrors,
    bestStreak: metrics.bestStreak,
    bestTrackingStreakMs: metrics.bestTrackingStreakMs,
    overshootCount: metrics.overshootCount,
    correctionCount: metrics.correctionCount,
    aimBiasX: metrics.aimBiasX,
    aimBiasY: metrics.aimBiasY,
  }
}

export type AimDiagnosis = {
  kind: 'overshoot' | 'clicks' | 'bias' | 'tracking' | 'balanced'
  rate: number
}

export function getAimDiagnosis(metrics: WarmupMetrics, exercise: WarmupExercise): AimDiagnosis {
  const clickExercise = exercise === 'flick' || exercise === 'reflex' || exercise === 'gridshot'
  const opportunities = clickExercise ? metrics.shots : metrics.correctionCount
  const overshootRate = opportunities > 0 ? Math.min(100, Math.round(metrics.overshootCount / opportunities * 100)) : 0

  if (metrics.overshootCount >= 2 && overshootRate >= 6) return { kind: 'overshoot', rate: overshootRate }
  if (clickExercise && metrics.shots >= 5 && metrics.clickErrors / metrics.shots >= .25) return { kind: 'clicks', rate: Math.round(metrics.clickErrors / metrics.shots * 100) }
  if (Math.hypot(metrics.aimBiasX ?? 0, metrics.aimBiasY ?? 0) >= .035) return { kind: 'bias', rate: 0 }
  if (!clickExercise && metrics.accuracy < 68) return { kind: 'tracking', rate: Math.round(metrics.accuracy) }
  return { kind: 'balanced', rate: 0 }
}

export function getWarmupRecommendation(metrics: WarmupMetrics, current: WarmupExercise): WarmupExercise {
  const trackingExercise = current === 'tracking' || current === 'strafetrack'
  if (trackingExercise && metrics.accuracy < 68) return current === 'tracking' ? 'strafetrack' : 'tracking'
  if (metrics.reactionTimeMs > 650) return 'reflex'
  if (metrics.clickErrors > Math.max(3, metrics.hits * 0.3) || (!trackingExercise && metrics.accuracy < 72)) return 'gridshot'
  if (metrics.overshootCount >= 5) return 'strafetrack'
  if (current === 'reflex') return 'gridshot'
  return 'reflex'
}

export function warmupSessionStorageKey(exercise: WarmupExercise) {
  return `sensi-warmup-session:v1:${exercise}`
}

export function readWarmupSession(storage: Storage, exercise: WarmupExercise): WarmupSessionSummary | null {
  try {
    const saved = storage.getItem(warmupSessionStorageKey(exercise))
    if (!saved) return null
    const parsed = JSON.parse(saved) as StoredWarmupSession
    return Number.isFinite(parsed.score) && Number.isFinite(parsed.accuracy) ? parsed : null
  } catch {
    return null
  }
}

export function readWarmupSessionHistory(storage: Storage, exercise: WarmupExercise): WarmupSessionSummary[] {
  try {
    const saved = storage.getItem(warmupSessionStorageKey(exercise))
    if (!saved) return []
    const parsed = JSON.parse(saved) as StoredWarmupSession
    const history = Array.isArray(parsed.history) ? parsed.history : [parsed]
    return history.filter(item => Number.isFinite(item?.score) && Number.isFinite(item?.accuracy))
  } catch {
    return []
  }
}

export function writeWarmupSession(storage: Storage, exercise: WarmupExercise, metrics: WarmupMetrics) {
  try {
    const summary = toWarmupSessionSummary(metrics)
    const history = [...readWarmupSessionHistory(storage, exercise), summary].slice(-100)
    storage.setItem(warmupSessionStorageKey(exercise), JSON.stringify({ ...summary, history }))
  } catch {
    // Training still works when storage is unavailable or full.
  }
}

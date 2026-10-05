import { getAnalysisMetrics, getMetricValue, type AnalysisMetric } from './analysisMetrics'
import { compareSessionOrder } from './personalBests'
import type { AnalysisMetricKey, TrainingSession } from './trainingSession'

export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all'
export type AnalysisQuery = { period: AnalysisPeriod; exercise: TrainingSession['exerciseId'] | 'all'; variant: string | null; metric: AnalysisMetricKey | null; now: number }
export type PeriodSummary = { count: number; mean: number | null; median: number | null; deviation: number | null; variation: number | null }
export type AnalysisVariant = { session: TrainingSession; count: number }
export type AnalysisData = { variants: AnalysisVariant[]; current: PeriodSummary; previous: PeriodSummary; total: number; selectedVariant: string | null; points: TrainingSession[]; recent: TrainingSession[]; pointCount: number }
export const ANALYSIS_POINT_LIMIT = 300
export const ANALYSIS_RECENT_LIMIT = 20
export const MIN_TREND_SESSIONS = 3
export const variantKey = (s: TrainingSession) => JSON.stringify([s.exerciseId, s.exerciseVersion, s.comparisonSignature])
export function isAnalysisSession(s: TrainingSession, owner: string | null) {
  return s.userId === owner && s.status === 'completed' && s.invalidReason === null && s.schemaVersion === 1
    && Number.isInteger(s.exerciseVersion) && s.exerciseVersion > 0 && !!s.config && !!s.context && !!s.metrics
    && !!s.comparisonSignature?.trim() && Number.isFinite(Date.parse(s.finishedAt)) && Number.isFinite(Date.parse(s.startedAt))
}
export function periodBounds(period: AnalysisPeriod, now: number) {
  const days = period === 'all' ? null : Number.parseInt(period)
  return { end: now, start: days === null ? -Infinity : now - days * 86400000, previousStart: days === null ? -Infinity : now - days * 2 * 86400000 }
}
export function splitPeriods(sessions: readonly TrainingSession[], period: AnalysisPeriod, now: number) {
  const { start, previousStart, end } = periodBounds(period, now)
  return { current: sessions.filter(s => Date.parse(s.finishedAt) >= start && Date.parse(s.finishedAt) <= end),
    previous: period === 'all' ? [] : sessions.filter(s => Date.parse(s.finishedAt) >= previousStart && Date.parse(s.finishedAt) < start) }
}
export function summarizeValues(values: readonly number[]): PeriodSummary {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b), count = sorted.length
  if (!count) return { count, mean: null, median: null, deviation: null, variation: null }
  // Scale before summing to avoid overflow; population CV describes observed sessions.
  const scale = Math.max(...sorted.map(Math.abs)) || 1, normalized = sorted.map(v => v / scale)
  const meanScaled = normalized.reduce((sum, v) => sum + v, 0) / count
  const deviationScaled = Math.sqrt(normalized.reduce((sum, v) => sum + (v - meanScaled) ** 2, 0) / count)
  const finite = (v: number) => Number.isFinite(v) ? v : null
  return { count, mean: finite(meanScaled * scale), median: finite(sorted[Math.floor((count - 1) / 2)] / 2 + sorted[Math.floor(count / 2)] / 2),
    deviation: count >= 2 ? finite(deviationScaled * scale) : null,
    variation: count >= 2 && meanScaled !== 0 ? finite(deviationScaled / Math.abs(meanScaled) * 100) : null }
}
export const aggregateValue = (summary: PeriodSummary, metric: AnalysisMetric) => summary[metric.aggregation]
export function comparePeriods(current: PeriodSummary, previous: PeriodSummary, metric: AnalysisMetric, period: AnalysisPeriod) {
  const value = aggregateValue(current, metric), baseline = aggregateValue(previous, metric)
  if (period === 'all' || current.count < MIN_TREND_SESSIONS || previous.count < MIN_TREND_SESSIONS || value === null || baseline === null || baseline === 0) return null
  const change = (value / baseline - 1) * 100 * (metric.direction === 'lower' ? -1 : 1)
  return Number.isFinite(change) ? change === 0 ? 0 : change : null
}
export function getPresetChanges(sessions: readonly TrainingSession[]) {
  const sorted = [...sessions].sort(compareSessionOrder)
  return sorted.flatMap((session, i) => {
    const previous = sorted[i - 1], a = previous?.context, b = session.context
    return a && b && (a.sensitivity !== b.sensitivity || a.dpi !== b.dpi || a.gameId !== b.gameId || (previous.presetId ?? a.presetId ?? null) !== (session.presetId ?? b.presetId ?? null)) ? [{ previous, session }] : []
  })
}
export function buildAnalysis(sessions: readonly TrainingSession[], owner: string | null, query: AnalysisQuery): AnalysisData {
  const valid = sessions.filter(s => isAnalysisSession(s, owner)).sort((a, b) => -compareSessionOrder(a, b))
  const periods = splitPeriods(valid, query.period, query.now), groups = new Map<string, AnalysisVariant>()
  for (const session of periods.current) {
    const key = variantKey(session), group = groups.get(key)
    if (group) group.count++; else groups.set(key, { session, count: 1 })
  }
  const variants = [...groups.values()], selected = variants.filter(v => v.session.exerciseId === query.exercise)
  const selectedVariant = query.exercise === 'all' ? null : query.variant ?? (selected[0] ? variantKey(selected[0].session) : null)
  const matches = (s: TrainingSession) => query.exercise === 'all' || s.exerciseId === query.exercise && variantKey(s) === selectedVariant
  const current = periods.current.filter(matches), previous = periods.previous.filter(matches)
  const metric = query.exercise === 'all' ? null : getAnalysisMetrics(query.exercise).find(m => m.key === query.metric) ?? getAnalysisMetrics(query.exercise)[0]
  const measured = (items: TrainingSession[]) => metric ? items.flatMap(s => { const v = getMetricValue(s, metric); return v === null ? [] : [v] }) : []
  const points = metric ? current.filter(s => getMetricValue(s, metric) !== null) : []
  return { variants, selectedVariant, total: current.length, current: summarizeValues(measured(current)), previous: summarizeValues(measured(previous)),
    points: points.slice(0, ANALYSIS_POINT_LIMIT).reverse(), pointCount: points.length, recent: current.slice(0, ANALYSIS_RECENT_LIMIT) }
}

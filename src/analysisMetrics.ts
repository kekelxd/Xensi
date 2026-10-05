import { SESSION_REGISTRY, type AnalysisMetricKey, type TrainingSession } from './trainingSession'
import type { TranslationKey } from './i18n'

export type AnalysisMetric = { key: AnalysisMetricKey; direction: 'higher' | 'lower'; unit: string; precision: number; aggregation: 'mean' | 'median'; label: TranslationKey; positiveOnly?: boolean }
const extras: Record<string, AnalysisMetric> = {
  accuracy: { key: 'accuracy', direction: 'higher', unit: '%', precision: 1, aggregation: 'mean', label: 'common.accuracy' },
  hits: { key: 'hits', direction: 'higher', unit: '', precision: 1, aggregation: 'mean', label: 'micro.hits' },
  medianReactionMs: { key: 'medianReactionMs', direction: 'lower', unit: 'ms', precision: 0, aggregation: 'median', positiveOnly: true, label: 'analysisV1.medianReaction' },
  medianAcquisitionTimeMs: { key: 'medianAcquisitionTimeMs', direction: 'lower', unit: 'ms', precision: 0, aggregation: 'median', positiveOnly: true, label: 'micro.median' },
  meanOvershootPx: { key: 'meanOvershootPx', direction: 'lower', unit: 'px', precision: 1, aggregation: 'mean', label: 'micro.overshoot' },
  targetsPerSecond: { key: 'targetsPerSecond', direction: 'higher', unit: '/s', precision: 2, aggregation: 'mean', label: 'micro.rate' },
}
export function getAnalysisMetrics(exercise: TrainingSession['exerciseId']): AnalysisMetric[] {
  const definition = SESSION_REGISTRY[exercise]
  const latency = definition.unit === 'milliseconds'
  const primary: AnalysisMetric = { key: definition.primaryMetric, direction: definition.direction,
    unit: definition.unit === 'percent' ? '%' : latency ? 'ms' : '', precision: definition.precision,
    aggregation: latency ? 'median' : 'mean', positiveOnly: latency,
    label: definition.primaryMetric === 'meanAcquisitionTimeMs' ? 'micro.acquisition' : definition.primaryMetric === 'bestReactionMs' ? 'analysisV1.bestReaction' : definition.primaryMetric === 'accuracy' ? 'common.accuracy' : 'common.score' }
  return [primary, ...(definition.analysisMetrics ?? []).map(key => extras[key]).filter((m): m is AnalysisMetric => !!m && m.key !== primary.key)]
}
export function getMetricValue(session: TrainingSession, metric: AnalysisMetric): number | null {
  const value = (session.metrics as Record<string, number | null> | null)?.[metric.key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!metric.positiveOnly || value > 0) ? value : null
}
export function formatAnalysisValue(value: number | null, metric: Pick<AnalysisMetric, 'precision' | 'unit'>, locale: string) {
  if (value === null || !Number.isFinite(value)) return '\u2014'
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: metric.precision }).format(value)
  return metric.unit === '%' ? `${number}%` : `${number}${metric.unit ? ` ${metric.unit}` : ''}`
}

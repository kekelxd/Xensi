import { parseCloudSession, sessionClientFor } from './sessionCloud'
import { variantKey, type AnalysisData, type AnalysisQuery, type PeriodSummary } from './analysisService'
export async function fetchAnalysis(owner: string, query: AnalysisQuery): Promise<AnalysisData> {
  const client = await sessionClientFor(owner)
  const variant: unknown = query.variant ? JSON.parse(query.variant) : null
  if (variant !== null && (!Array.isArray(variant) || variant.length !== 3 || variant[0] !== query.exercise || !Number.isInteger(variant[1]) || typeof variant[2] !== 'string')) throw new Error('Invalid analysis configuration')
  const { data, error } = await client.rpc('xensi_analysis_v1', { expected_user_id: owner,
    period_days: query.period === 'all' ? null : Number.parseInt(query.period), as_of: new Date(query.now).toISOString(),
    target_exercise: query.exercise === 'all' ? null : query.exercise,
    target_signature: Array.isArray(variant) ? variant[2] : null, target_version: Array.isArray(variant) ? variant[1] : null,
    metric_key: query.metric ?? 'score' })
  if (error) throw error
  await sessionClientFor(owner)
  const count = (v: unknown) => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('Invalid analysis count'); return v }
  const summary = (v: unknown): PeriodSummary => {
    if (!v || typeof v !== 'object') throw new Error('Invalid analysis summary')
    const s = v as PeriodSummary
    count(s.count)
    for (const key of ['mean','median','deviation','variation'] as const) if (s[key] !== null && (typeof s[key] !== 'number' || !Number.isFinite(s[key]))) throw new Error('Invalid analysis metric')
    return s
  }
  if (!data || !Array.isArray(data.variants) || !Array.isArray(data.points) || !Array.isArray(data.recent) || data.points.length>300 || data.recent.length>20) throw new Error('Invalid analysis response')
  return { variants: data.variants.map((v: { session: unknown; count: unknown }) => ({ session: parseCloudSession(v.session, owner), count: count(v.count) })),
    selectedVariant: data.selected && query.exercise !== 'all' ? variantKey(parseCloudSession(data.selected, owner)) : null,
    total: count(data.total), current: summary(data.current), previous: summary(data.previous), pointCount: count(data.pointCount),
    points: data.points.map((s: unknown) => parseCloudSession(s, owner)), recent: data.recent.map((s: unknown) => parseCloudSession(s, owner)) }
}

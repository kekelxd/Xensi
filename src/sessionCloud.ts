import { isUUID } from './accountCollectionRepository'
import { getSupabaseClient } from './supabaseClient'
import { SESSION_EXERCISES, type TrainingSession, type RoutineRun } from './trainingSession'
import type { SessionDocument } from './sessionStorage'

type Row = Record<string, unknown>
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid session response')
  return value as Row
}
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nullableUUID = (value: unknown) => value === null || typeof value === 'string' && isUUID(value)
export function parseCloudSession(value: unknown, owner: string): TrainingSession {
  const r = row(value)
  if (r.user_id !== owner || typeof r.id !== 'string' || !isUUID(r.id) || !SESSION_EXERCISES.includes(r.exercise_id as TrainingSession['exerciseId'])
    || !date(r.started_at) || !date(r.finished_at) || !Number.isFinite(r.duration_ms) || Number(r.duration_ms) < 0
    || !['completed', 'invalid', 'interrupted'].includes(String(r.status)) || r.schema_version !== 1 || !Number.isInteger(r.exercise_version) || Number(r.exercise_version) < 1
    || !['preset_id', 'routine_id', 'routine_step_id', 'routine_run_id'].every(key => nullableUUID(r[key]))) throw new Error('Invalid session response')
  if (r.metrics !== null) {
    const metrics = row(r.metrics)
    if (!Object.values(metrics).every(v => v === null || typeof v === 'number' && Number.isFinite(v))) throw new Error('Invalid session metrics')
    const required = r.exercise_id === 'micro_flick' ? ['hits', 'misses', 'shots', 'timeouts', 'accuracy', 'targetsPerSecond', 'overshootCount'] : r.exercise_id === 'sniper-reaction' ? ['hits', 'shots', 'accuracy', 'reactionTimeMs', 'misses', 'earlyShots', 'noShots', 'attempts'] :
      r.exercise_id === 'tracking' || r.exercise_id === 'strafetrack' ? ['accuracy', 'onTargetMs', 'bestTrackingStreakMs'] : ['score', 'accuracy', 'hits']
    if (r.status === 'completed' && !required.every(key => typeof metrics[key] === 'number')) throw new Error('Missing session metrics')
  }
  if (r.context !== null) {
    const context = row(r.context)
    if (typeof context.gameId !== 'string' || !(Number(context.sensitivity) > 0) || !(Number(context.dpi) > 0)) throw new Error('Invalid session context')
  }
  if (r.configuration !== null) row(r.configuration)
  if (r.status === 'completed' && (!r.metrics || !r.context || !r.configuration || typeof r.comparison_signature !== 'string')) throw new Error('Incomplete session')
  return { id: r.id, userId: owner, exerciseId: r.exercise_id, startedAt: r.started_at, finishedAt: r.finished_at, durationMs: r.duration_ms,
    status: r.status, invalidReason: r.invalid_reason, routineRunId: r.routine_run_id, routineId: r.routine_id, routineStepId: r.routine_step_id,
    presetId: r.preset_id, context: r.context, config: r.configuration, metrics: r.metrics, comparisonSignature: r.comparison_signature,
    schemaVersion: r.schema_version, exerciseVersion: r.exercise_version } as TrainingSession
}
export function sessionRow(s: TrainingSession) {
  return { id: s.id, user_id: s.userId, exercise_id: s.exerciseId, started_at: s.startedAt, finished_at: s.finishedAt,
    duration_ms: s.durationMs, status: s.status, invalid_reason: s.invalidReason, routine_run_id: s.routineRunId, routine_id: s.routineId,
    routine_step_id: s.routineStepId, preset_id: s.presetId, context: s.context, configuration: s.config, metrics: s.metrics,
    comparison_signature: s.comparisonSignature, schema_version: s.schemaVersion, exercise_version: s.exerciseVersion }
}
export function runRow(r: RoutineRun) {
  return { id: r.id, user_id: r.userId, routine_id: r.routineId, routine_name: r.routineName, started_at: r.startedAt,
    finished_at: r.finishedAt, duration_ms: r.durationMs, status: r.status, invalid_reason: r.invalidReason, schema_version: r.schemaVersion }
}
export interface SessionCloud {
  fetch(owner: string, options?: { days?: 7 | 30 | 90; exercise?: TrainingSession['exerciseId']; offset?: number; limit?: number }): Promise<TrainingSession[]>
  append(owner: string, documents: SessionDocument[]): Promise<TrainingSession[]>
}
export async function sessionClientFor(owner: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase unavailable')
  const { data, error } = await client.auth.getSession()
  if (error || data.session?.user.id !== owner) throw new Error('Account changed')
  return client
}
export const sessionCloud: SessionCloud = {
  async fetch(owner, options = {}) {
    const client = await sessionClientFor(owner)
    const limit = Math.min(300, Math.max(1, options.limit ?? 300)), offset = Math.max(0, options.offset ?? 0)
    let query = client.from('training_sessions').select('*').eq('user_id', owner).order('finished_at', { ascending: false }).order('id').range(offset, offset + limit - 1)
    if (options.exercise) query = query.eq('exercise_id', options.exercise)
    if (options.days) query = query.gte('finished_at', new Date(Date.now() - options.days * 86400000).toISOString())
    const { data, error } = await query
    if (error || !Array.isArray(data)) throw error ?? new Error('Invalid history response')
    await sessionClientFor(owner)
    return data.map(item => parseCloudSession(item, owner))
  },
  async append(owner, documents) {
    const client = await sessionClientFor(owner)
    if (documents.some(doc => doc.value.userId !== owner)) throw new Error('Queue owner mismatch')
    const { data, error } = await client.rpc('xensi_append_training_history', { expected_user_id: owner, payload: {
      sessions: documents.filter(doc => doc.kind === 'session').map(doc => sessionRow(doc.value as TrainingSession)),
      runs: documents.filter(doc => doc.kind === 'run').map(doc => runRow(doc.value as RoutineRun)),
    } })
    if (error) throw error
    const result = row(data)
    if (!Array.isArray(result.sessions) || !Array.isArray(result.runs)) throw new Error('Invalid append confirmation')
    const sessions = result.sessions.map(item => parseCloudSession(item, owner))
    if (!documents.every(doc => doc.kind === 'session' ? sessions.some(s => s.id === doc.value.id) :
      (result.runs as unknown[]).some(item => row(item).id === doc.value.id && row(item).user_id === owner &&
        (doc.value.status === 'running' || row(item).status !== 'running')))) throw new Error('Incomplete append confirmation')
    await sessionClientFor(owner)
    return sessions
  },
}

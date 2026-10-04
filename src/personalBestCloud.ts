import { parseCloudSession, sessionClientFor } from './sessionCloud'
import { SESSION_EXERCISES, SESSION_REGISTRY, type TrainingSession } from './trainingSession'
import { getPersonalBestValue } from './personalBests'

export type PersonalBestQuery = {
  exerciseId?: TrainingSession['exerciseId']
  comparisonSignature?: string
  exerciseVersion?: number
  beforeSessionId?: string
}
export type PersonalBestSource = (owner: string, query?: PersonalBestQuery) => Promise<TrainingSession[]>

export const fetchPersonalBestSessions: PersonalBestSource = async (owner, query = {}) => {
  const client = await sessionClientFor(owner)
  const exercises = query.exerciseId ? [query.exerciseId] : SESSION_EXERCISES
  const definitions = exercises.filter(id => SESSION_REGISTRY[id].pbSupported).map(id => ({
    exercise_id: id, primary_metric: SESSION_REGISTRY[id].primaryMetric, direction: SESSION_REGISTRY[id].direction,
    min_accuracy: SESSION_REGISTRY[id].pbRequirements?.minAccuracy ?? null,
    min_hits: SESSION_REGISTRY[id].pbRequirements?.minHits ?? null,
  }))
  if (!definitions.length) return []
  const sessions: TrainingSession[] = []
  for (let offset = 0; ; offset += 100) {
    await sessionClientFor(owner)
    const { data, error } = await client.rpc('xensi_personal_best_sessions', {
      expected_user_id: owner, definitions, target_signature: query.comparisonSignature ?? null,
      target_exercise_version: query.exerciseVersion ?? null, before_session_id: query.beforeSessionId ?? null,
      page_offset: offset, page_size: 100,
    })
    if (error || !Array.isArray(data)) throw error ?? new Error('Invalid PB response')
    await sessionClientFor(owner)
    const page = data.map(row => parseCloudSession(row, owner))
    if (page.some(session => getPersonalBestValue(session) === null || !exercises.includes(session.exerciseId)
      || query.comparisonSignature !== undefined && session.comparisonSignature !== query.comparisonSignature
      || query.exerciseVersion !== undefined && session.exerciseVersion !== query.exerciseVersion)) throw new Error('Invalid PB group')
    sessions.push(...page)
    if (page.length < 100) return sessions
  }
}

import { SESSION_REGISTRY, type ExerciseMetricDefinition, type TrainingSession } from './trainingSession'

export type PersonalBest = {
  key: string
  userId: string | null
  exerciseId: TrainingSession['exerciseId']
  exerciseVersion: number
  comparisonSignature: string
  metricKey: ExerciseMetricDefinition['primaryMetric']
  direction: ExerciseMetricDefinition['direction']
  value: number
  sessionId: string
  achievedAt: string
  session: TrainingSession
}
export type PersonalBestResult = {
  status: 'first' | 'new' | 'none'
  definition: ExerciseMetricDefinition
  value: number
  previousValue: number | null
  delta: number | null
  current: TrainingSession
  previous: PersonalBest | null
}

export function personalBestKey(session: TrainingSession) {
  return JSON.stringify([session.userId, session.exerciseId, session.exerciseVersion,
    session.comparisonSignature, SESSION_REGISTRY[session.exerciseId].primaryMetric])
}

export function getPersonalBestValue(session: TrainingSession): number | null {
  const definition = SESSION_REGISTRY[session.exerciseId]
  if (!definition?.pbSupported || session.status !== 'completed' || session.invalidReason !== null
    || session.schemaVersion !== 1 || !Number.isInteger(session.exerciseVersion) || session.exerciseVersion < 1
    || !session.comparisonSignature?.trim() || !session.config || !session.context || !session.metrics
    || !Number.isFinite(Date.parse(session.finishedAt)) || !Number.isFinite(Date.parse(session.startedAt))) return null
  const value = (session.metrics as Partial<Record<ExerciseMetricDefinition['primaryMetric'], number | null>>)[definition.primaryMetric]
  const requirements = definition.pbRequirements
  const quality = session.metrics as { accuracy?: number; hits?: number }
  if (requirements && (!Number.isFinite(quality.accuracy) || !Number.isFinite(quality.hits)
    || !(quality.accuracy! >= requirements.minAccuracy) || !(quality.hits! >= requirements.minHits))) return null
  return typeof value === 'number' && Number.isFinite(value) && (definition.direction === 'lower' ? value > 0 : value >= 0) ? value : null
}

// SQL uses the same chronological tie order; formatting never changes comparison.
export function compareSessionOrder(a: TrainingSession, b: TrainingSession) {
  return Date.parse(a.finishedAt) - Date.parse(b.finishedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
function better(value: number, previous: number, direction: ExerciseMetricDefinition['direction']) {
  return direction === 'higher' ? value > previous : value < previous
}
function toPersonalBest(session: TrainingSession, value: number): PersonalBest {
  const definition = SESSION_REGISTRY[session.exerciseId]
  return { key: personalBestKey(session), userId: session.userId, exerciseId: session.exerciseId,
    exerciseVersion: session.exerciseVersion, comparisonSignature: session.comparisonSignature!,
    metricKey: definition.primaryMetric, direction: definition.direction, value,
    sessionId: session.id, achievedAt: session.finishedAt, session }
}

export function derivePersonalBests(sessions: readonly TrainingSession[], owner: string | null): PersonalBest[] {
  const bests = new Map<string, PersonalBest>()
  for (const session of sessions) {
    if (session.userId !== owner) continue
    const value = getPersonalBestValue(session)
    if (value === null) continue
    const key = personalBestKey(session), previous = bests.get(key)
    if (!previous || better(value, previous.value, previous.direction)
      || value === previous.value && compareSessionOrder(session, previous.session) < 0) bests.set(key, toPersonalBest(session, value))
  }
  return [...bests.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

export function getPBForSession(session: TrainingSession, history: readonly TrainingSession[]) {
  return derivePersonalBests(history, session.userId).find(best => best.key === personalBestKey(session)) ?? null
}

export function evaluatePersonalBest(current: TrainingSession, history: readonly TrainingSession[]): PersonalBestResult | null {
  const value = getPersonalBestValue(current)
  if (value === null) return null
  const definition = SESSION_REGISTRY[current.exerciseId]
  const previous = getPBForSession(current, history.filter(s => s.id !== current.id && compareSessionOrder(s, current) < 0))
  const status = !previous ? 'first' : better(value, previous.value, definition.direction) ? 'new' : 'none'
  return { status, definition, value, previousValue: previous?.value ?? null,
    delta: status === 'new' ? Math.abs(value - previous!.value) : null, current, previous }
}

export function didSessionSetPB(session: TrainingSession, history: readonly TrainingSession[]) {
  const result = evaluatePersonalBest(session, history)
  return !!result && result.status !== 'none'
}

export function formatPersonalBestValue(result: { definition: ExerciseMetricDefinition; value: number }, locale = 'en') {
  const value = new Intl.NumberFormat(locale, { minimumFractionDigits: result.definition.precision,
    maximumFractionDigits: result.definition.precision }).format(result.value)
  return result.definition.unit === 'milliseconds' ? `${value} ms` : result.definition.unit === 'percent' ? `${value}%` : value
}

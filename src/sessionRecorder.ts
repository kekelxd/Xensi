import { comparisonSignature, sessionMetrics, type ExerciseConfig, type RoutineRun, type SessionReason, type TrainingSession } from './trainingSession'
import type { SessionContext } from './playerProfileStore'
import type { WarmupMetrics } from './warmupTelemetry'
import type { SessionDocument, ActiveDocument } from './sessionStorage'

export interface RecordingSink {
  active(document: ActiveDocument): Promise<void>
  append(document: SessionDocument): Promise<void>
}
export class SessionRecorder {
  private current: { session: TrainingSession; monotonicStart: number; lastMetrics: WarmupMetrics | null; reason: SessionReason | null } | null = null
  private run: { record: RoutineRun; monotonicStart: number; reason: SessionReason | null } | null = null
  constructor(private sink: RecordingSink, private tabId: string, private now = () => performance.now(), private absolute = () => new Date().toISOString()) {}
  beginRun(owner: string | null, routineId: string, routineName: string) {
    this.abort('manual_abort'); this.finishRun('interrupted', 'manual_abort')
    const record: RoutineRun = { id: crypto.randomUUID(), userId: owner, routineId, routineName,
      startedAt: this.absolute(), finishedAt: null, durationMs: 0, status: 'running', invalidReason: null, schemaVersion: 1 }
    this.run = { record, monotonicStart: this.now(), reason: null }
    void this.sink.active({ kind: 'run', value: record, tabId: this.tabId })
    void this.sink.append({ kind: 'run', value: record })
    // append normally removes an active anchor, so retain the run anchor until its endpoint.
    void this.sink.active({ kind: 'run', value: record, tabId: this.tabId })
    return record.id
  }
  start(owner: string | null, exerciseId: TrainingSession['exerciseId'], context: SessionContext, config: ExerciseConfig, routineStepId: string | null = null) {
    this.abort('manual_abort')
    const startedAt = this.absolute()
    const session: TrainingSession = {
      id: crypto.randomUUID(), userId: owner, exerciseId, startedAt, finishedAt: startedAt, durationMs: 0,
      status: 'interrupted', invalidReason: 'page_reload', routineRunId: this.run?.record.id ?? null,
      routineId: this.run?.record.routineId ?? null, routineStepId, presetId: context.presetId ?? null,
      context: structuredClone({ ...context, configuration: { difficulty: config.effectiveDifficulty, durationSeconds: config.durationSeconds },
        ...(this.run ? { routine: { id: this.run.record.routineId, name: this.run.record.routineName, stepId: routineStepId } } : {}) }),
      config: structuredClone(config), comparisonSignature: comparisonSignature(exerciseId, config),
      metrics: null, schemaVersion: 1, exerciseVersion: 1,
    } as TrainingSession
    this.current = { session, monotonicStart: this.now(), lastMetrics: null, reason: null }
    void this.sink.active({ kind: 'session', value: session, tabId: this.tabId })
    return session.id
  }
  sample(metrics: WarmupMetrics) { if (this.current) this.current.lastMetrics = metrics }
  invalidate(reason: SessionReason) {
    if (this.current) { this.current.reason ??= reason; if (this.run) this.run.reason ??= reason }
  }
  complete(metrics: WarmupMetrics) { return this.finish(metrics, false, null) }
  abort(reason: SessionReason) { return this.finish(this.current?.lastMetrics ?? null, true, reason) }
  private finish(metrics: WarmupMetrics | null, interrupted: boolean, reason: SessionReason | null) {
    const current = this.current
    if (!current) return null
    this.current = null
    const invalidReason = current.reason ?? reason
    const session = { ...current.session, finishedAt: this.absolute(), durationMs: Math.max(0, Math.round(this.now() - current.monotonicStart)),
      status: interrupted ? 'interrupted' : invalidReason ? 'invalid' : 'completed', invalidReason,
      metrics: metrics ? sessionMetrics(current.session.exerciseId, metrics) : null } as TrainingSession
    if (this.run && (interrupted || invalidReason)) this.run.reason ??= invalidReason ?? 'manual_abort'
    void this.sink.append({ kind: 'session', value: session })
    return session
  }
  finishRun(status: 'completed' | 'interrupted' = 'completed', reason: SessionReason | null = null) {
    if (!this.run) return null
    const run = this.run
    this.run = null
    const invalidReason = run.reason ?? reason
    const record: RoutineRun = { ...run.record, finishedAt: this.absolute(), durationMs: Math.max(0, Math.round(this.now() - run.monotonicStart)),
      status: status === 'interrupted' ? 'interrupted' : invalidReason ? 'invalid' : 'completed', invalidReason }
    void this.sink.append({ kind: 'run', value: record })
    return record
  }
}

import { isUUID } from './accountCollectionRepository'
import { readWarmupSessionHistory, warmupSessionStorageKey } from './warmupTelemetry'
import { SESSION_EXERCISES, sessionMetrics, type RoutineRun, type TrainingSession } from './trainingSession'

export const GUEST_SESSION_LIMIT = 3000
export const SESSION_CACHE_LIMIT = 300
export const SESSION_PENDING_LIMIT = 500
export type SessionDocument = { kind: 'session'; value: TrainingSession } | { kind: 'run'; value: RoutineRun }
export type ActiveDocument = SessionDocument & { tabId: string }
type Stored = { key: string; scope: string; kind: 'session' | 'run' | 'pending' | 'active' | 'receipt' | 'meta'; value: unknown }
const scope = (owner: string | null) => owner ? `user:${owner}` : 'guest'
const documentId = (document: SessionDocument) => `${document.kind}:${document.value.id}`
export interface SessionStorage {
  sessions(owner: string | null): Promise<TrainingSession[]>
  runs(owner: string | null): Promise<RoutineRun[]>
  save(document: SessionDocument, enqueue: boolean): Promise<void>
  remove(owner: string | null, id: string): Promise<void>
  active(document: ActiveDocument): Promise<void>
  recover(owner: string | null, tabId: string): Promise<void>
  pending(owner: string): Promise<SessionDocument[]>
  acknowledge(owner: string, documents: SessionDocument[]): Promise<void>
  cache(owner: string, sessions: TrainingSession[]): Promise<void>
  pendingGuest(owner: string): Promise<TrainingSession[]>
  receipt(owner: string, sessions: TrainingSession[]): Promise<void>
}

export class IndexedSessionStorage implements SessionStorage {
  private database: Promise<IDBDatabase> | null = null
  constructor(private factory: IDBFactory | undefined, private legacy: Storage, private databaseName = 'xensi-sessions-v1') {}
  private open() {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      if (!this.factory) { reject(new Error('IndexedDB unavailable')); return }
      const request = this.factory.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('documents', { keyPath: 'key' })
        store.createIndex('scope', 'scope')
      }
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
      request.onerror = () => { this.database = null; reject(request.error) }
      request.onblocked = () => { this.database = null; reject(new Error('Session database blocked')) }
    })
    return this.database
  }
  private async transaction<T>(owner: string | null, mode: IDBTransactionMode, action: (items: Stored[], store: IDBObjectStore) => T): Promise<T> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', mode), store = tx.objectStore('documents')
      const request = store.index('scope').getAll(scope(owner))
      let result: T, failure: unknown
      request.onsuccess = () => { try { result = action(request.result as Stored[], store) } catch (error) { failure = error; tx.abort() } }
      tx.oncomplete = () => resolve(result)
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? request.error ?? new Error('Session storage failed'))
    })
  }
  private put(store: IDBObjectStore, owner: string | null, kind: Stored['kind'], id: string, value: unknown) {
    store.put({ key: `${scope(owner)}:${kind}:${id}`, scope: scope(owner), kind, value })
  }
  async migrateLegacy() {
    await this.transaction(null, 'readwrite', (items, store) => {
      if (items.some(item => item.kind === 'meta' && item.key.endsWith(':legacy'))) return
      // Leave original raw documents untouched; old records cannot prove valid V1 timing/configuration.
      for (const exercise of SESSION_EXERCISES) {
        const raw = this.legacy.getItem(warmupSessionStorageKey(exercise))
        if (raw) JSON.parse(raw) // Corruption must never be treated as an empty history.
        for (const summary of readWarmupSessionHistory(this.legacy, exercise)) {
          if (!summary.completedAt || !Number.isFinite(Date.parse(summary.completedAt))) continue
          const produced = sessionMetrics(exercise, { ...summary, remaining: 0 })
          const metrics = produced ? Object.fromEntries(Object.entries(produced).filter(([, value]) => value === null || typeof value === 'number' && Number.isFinite(value))) : null
          const context = summary.sessionContext
          const usableContext = context && typeof context.gameId === 'string' && Number.isFinite(context.sensitivity) && context.sensitivity > 0 && Number.isFinite(context.dpi) && context.dpi > 0 ? context : null
          const session: TrainingSession = {
            id: crypto.randomUUID(), userId: null, exerciseId: exercise, startedAt: summary.completedAt, finishedAt: summary.completedAt,
            durationMs: 0, status: 'invalid', invalidReason: 'legacy_unverified', routineRunId: null, routineId: null, routineStepId: null,
            presetId: summary.sessionContext?.presetId && isUUID(summary.sessionContext.presetId) ? summary.sessionContext.presetId : null,
            context: usableContext, config: null, comparisonSignature: null, schemaVersion: 1, exerciseVersion: 1, metrics,
          } as TrainingSession
          this.put(store, null, 'session', session.id, session)
        }
      }
      this.put(store, null, 'meta', 'legacy', { migratedAt: new Date().toISOString() })
    })
  }
  async sessions(owner: string | null) {
    if (!owner) await this.migrateLegacy()
    return this.transaction(owner, 'readonly', items => {
      const sessions = items.filter(item => item.kind === 'session').map(item => item.value as TrainingSession)
      if (sessions.some(s => !s || s.userId !== owner || !isUUID(s.id) || !SESSION_EXERCISES.includes(s.exerciseId)
        || !Number.isFinite(Date.parse(s.startedAt)) || !Number.isFinite(Date.parse(s.finishedAt))
        || !Number.isFinite(s.durationMs) || s.durationMs < 0 || s.schemaVersion !== 1 || !Number.isInteger(s.exerciseVersion) || s.exerciseVersion < 1
        || !['completed', 'invalid', 'interrupted'].includes(s.status))) throw new Error('Invalid session cache')
      return sessions.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt) || a.id.localeCompare(b.id))
    })
  }
  runs(owner: string | null) { return this.transaction(owner, 'readonly', items => items.filter(item => item.kind === 'run').map(item => item.value as RoutineRun)) }
  async remove(owner: string | null, id: string) {
    await this.transaction(owner, 'readwrite', (_items, store) => {
      store.delete(`${scope(owner)}:session:${id}`)
      store.delete(`${scope(owner)}:pending:session:${id}`)
    })
  }
  async save(document: SessionDocument, enqueue: boolean) {
    const owner = document.value.userId
    await this.transaction(owner, 'readwrite', (items, store) => {
      const id = documentId(document)
      if (enqueue && owner && !items.some(item => item.key === `${scope(owner)}:pending:${id}`) && items.filter(item => item.kind === 'pending').length >= SESSION_PENDING_LIMIT) throw new Error('Session pending queue full')
      this.put(store, owner, document.kind, document.value.id, document.value)
      store.delete(`${scope(owner)}:active:${id}`)
      if (enqueue && owner) this.put(store, owner, 'pending', id, document)
      const limit = owner ? SESSION_CACHE_LIMIT : document.kind === 'session' ? GUEST_SESSION_LIMIT : 1000
      const history = items.filter(item => item.kind === document.kind && item.key !== `${scope(owner)}:${document.kind}:${document.value.id}`)
        .sort((a, b) => (b.value as TrainingSession).startedAt.localeCompare((a.value as TrainingSession).startedAt))
      if (document.kind === 'session') history.slice(limit - 1).forEach(item => store.delete(item.key))
      else {
        const referenced = new Set(items.filter(item => item.kind === 'session').map(item => (item.value as TrainingSession).routineRunId))
        items.filter(item => item.kind === 'pending').map(item => item.value as SessionDocument).forEach(doc => {
          if (doc.kind === 'session') referenced.add(doc.value.routineRunId)
          else referenced.add(doc.value.id)
        })
        history.filter(item => !referenced.has((item.value as RoutineRun).id)).slice(limit - 1).forEach(item => store.delete(item.key))
      }
    })
  }
  active(document: ActiveDocument) { return this.transaction(document.value.userId, 'readwrite', (_, store) => { this.put(store, document.value.userId, 'active', documentId(document), document) }) }
  async recover(owner: string | null, tabId: string) {
    const active = await this.transaction(owner, 'readonly', items => items.filter(item => item.kind === 'active').map(item => item.value as ActiveDocument))
    for (const doc of active) {
      if (doc.tabId !== tabId && Date.now() - Date.parse(doc.value.startedAt) < 86400000) continue
      const now = new Date().toISOString()
      await this.save({ ...doc, value: { ...doc.value, status: 'interrupted', invalidReason: 'page_reload', finishedAt: now,
        durationMs: doc.value.durationMs } } as SessionDocument, !!owner)
    }
  }
  pending(owner: string) { return this.transaction(owner, 'readonly', items => items.filter(item => item.kind === 'pending').map(item => item.value as SessionDocument)) }
  acknowledge(owner: string, documents: SessionDocument[]) {
    return this.transaction(owner, 'readwrite', (items, store) => {
      for (const doc of documents) {
        const key = `${scope(owner)}:pending:${documentId(doc)}`, item = items.find(item => item.key === key)
        // An in-flight running-run acknowledgement must not erase its newer terminal update.
        if (item && JSON.stringify(item.value) === JSON.stringify(doc)) store.delete(key)
      }
    })
  }
  cache(owner: string, sessions: TrainingSession[]) {
    return this.transaction(owner, 'readwrite', (items, store) => {
      items.filter(item => item.kind === 'session').forEach(item => store.delete(item.key))
      const pending = items.filter(item => item.kind === 'pending').map(item => item.value as SessionDocument).filter(doc => doc.kind === 'session').map(doc => doc.value as TrainingSession)
      const merged = [...new Map([...sessions, ...pending].map(s => [s.id, s])).values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, SESSION_CACHE_LIMIT)
      merged.forEach(session => this.put(store, owner, 'session', session.id, session))
    })
  }
  async pendingGuest(owner: string) {
    const sessions = await this.sessions(null)
    const imported = await this.transaction(owner, 'readonly', items => new Set(items.filter(item => item.kind === 'receipt').map(item => item.value as string)))
    return sessions.filter(session => !imported.has(session.id))
  }
  receipt(owner: string, sessions: TrainingSession[]) {
    return this.transaction(owner, 'readwrite', (_, store) => { sessions.forEach(session => this.put(store, owner, 'receipt', session.id, session.id)) })
  }
}

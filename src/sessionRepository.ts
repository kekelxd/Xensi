import { useSyncExternalStore } from 'react'
import { AccountCollectionRepository, bindAccountCollection, type CollectionPersistence } from './accountCollectionRepository'
import { IndexedSessionStorage, SESSION_CACHE_LIMIT, type ActiveDocument, type SessionDocument, type SessionStorage } from './sessionStorage'
import { sessionCloud, type SessionCloud } from './sessionCloud'
import { sessionSummary, type TrainingSession } from './trainingSession'

export class SessionRepository extends AccountCollectionRepository<TrainingSession> {
  private flushing: Promise<void> = Promise.resolve()
  private writes: Promise<void> = Promise.resolve()
  constructor(storage: Storage, readonly database: SessionStorage, private cloud: SessionCloud, tabId: string, offerStorage?: Storage, private onSaved = () => {}) {
    const recovered = new Set<string>()
    const recover = async (owner: string | null) => {
      const key = owner ?? 'guest'
      if (!recovered.has(key)) { await database.recover(owner, tabId); recovered.add(key) }
    }
    const persistence: CollectionPersistence<TrainingSession> = {
      namespace: 'xensi-sessions', eagerRead: false,
      readGuest: async () => { await recover(null); return database.sessions(null) },
      readCache: owner => database.sessions(owner), writeCache: (owner, items) => database.cache(owner, items),
      pendingGuest: owner => database.pendingGuest(owner), markImported: (owner, items) => database.receipt(owner, items),
      fetch: async owner => {
        await this.flush(owner)
        await recover(owner)
        await this.flush(owner)
        const confirmed = await cloud.fetch(owner)
        const pending = (await database.pending(owner)).filter(doc => doc.kind === 'session').map(doc => doc.value as TrainingSession)
        return [...new Map([...confirmed, ...pending].map(s => [s.id, s])).values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, SESSION_CACHE_LIMIT)
      },
      import: async (items, owner) => {
        const wantedRuns = new Set(items.map(s => s.routineRunId).filter(Boolean))
        const runs = (await database.runs(null)).filter(r => wantedRuns.has(r.id))
        // Import in bounded batches; receipts are only issued once every requested UUID is confirmed.
        for (let i = 0; i < runs.length; i += 100) {
          if (this.state.userId !== owner) throw new Error('Account changed')
          await cloud.append(owner, runs.slice(i, i + 100).map(r => ({ kind: 'run', value: { ...r, userId: owner } })))
        }
        const saved: TrainingSession[] = []
        for (let i = 0; i < items.length; i += 100) {
          if (this.state.userId !== owner) throw new Error('Account changed')
          saved.push(...await cloud.append(owner, items.slice(i, i + 100).map(s => ({ kind: 'session', value: { ...s, userId: owner } } as SessionDocument))))
        }
        const confirmed = await cloud.fetch(owner)
        return [...new Map([...saved, ...confirmed].map(s => [s.id, s])).values()]
      },
    }
    super(storage, persistence, offerStorage)
  }
  getSnapshot = () => this.getCollectionSnapshot()
  history(exercise: TrainingSession['exerciseId']) {
    return this.state.items.filter(s => s.exerciseId === exercise && s.status === 'completed').map(sessionSummary).filter(s => s !== null)
  }
  active(document: ActiveDocument) { return this.enqueue(() => this.database.active(document), document.value.userId) }
  append(document: SessionDocument) {
    return this.enqueue(async () => {
      await this.database.save(document, document.value.userId !== null)
      this.onSaved()
      if (this.state.status !== 'auth-loading' && this.state.userId === document.value.userId) {
        const items = await this.database.sessions(document.value.userId)
        if (this.state.userId !== document.value.userId) return
        this.publish({ items })
        if (document.value.userId) void this.flush(document.value.userId).catch(() => { if (this.state.userId === document.value.userId) this.publish({ error: 'sync' }) })
      }
      else if (document.value.userId === null && this.state.userId && this.state.status === 'ready') void this.refresh()
    }, document.value.userId)
  }
  private enqueue(action: () => Promise<void>, owner: string | null) {
    const write = this.writes.then(action)
    this.writes = write.catch(() => { if (this.state.userId === owner) this.publish({ error: 'storage' }) })
    return this.writes
  }
  async waitForSession(session: TrainingSession) {
    await this.writes
    if (this.state.status === 'auth-loading' || this.state.userId !== session.userId) throw new Error('Account changed')
    if (!(await this.database.sessions(session.userId)).some(item => item.id === session.id)) throw new Error('Session not persisted')
    if (session.userId) await this.flush(session.userId)
    if (this.state.userId !== session.userId) throw new Error('Account changed')
  }
  async flush(owner: string) {
    const operation = async () => {
      let confirmed = false
      while (this.state.userId === owner) {
        const pending = await this.database.pending(owner)
        if (!pending.length) {
          if (confirmed) { this.publish({}); this.onSaved() }
          return
        }
        const batch = pending.slice(0, 50)
        const runIds = new Set(batch.filter(doc => doc.kind === 'session').map(doc => (doc.value as TrainingSession).routineRunId).filter(Boolean))
        const dependencies: SessionDocument[] = (await this.database.runs(owner)).filter(r => runIds.has(r.id) && !batch.some(doc => doc.kind === 'run' && doc.value.id === r.id)).map(value => ({ kind: 'run', value }))
        if (this.state.userId !== owner) throw new Error('Account changed')
        await this.cloud.append(owner, [...dependencies, ...batch])
        await this.database.acknowledge(owner, batch)
        confirmed = true
      }
      throw new Error('Account changed')
    }
    const promise = this.flushing.catch(() => {}).then(operation)
    this.flushing = promise
    await promise
  }
  importGuestSessions = () => this.importGuestData()
}

let repository: SessionRepository | null = null
export function sessionTabId() {
  // HMR/dynamic imports can evaluate this module twice in one document.
  const page = window as Window & { xensiSessionTabId?: string }
  if (!page.xensiSessionTabId) {
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const resumed = !navigation || navigation.type === 'reload' || navigation.type === 'back_forward'
      // A newly opened/duplicated tab may clone sessionStorage; it must not recover a live parent's anchors.
      page.xensiSessionTabId = resumed ? sessionStorage.getItem('xensi-session-tab') ?? crypto.randomUUID() : crypto.randomUUID()
      sessionStorage.setItem('xensi-session-tab', page.xensiSessionTabId)
    } catch { page.xensiSessionTabId = crypto.randomUUID() }
  }
  return page.xensiSessionTabId
}
export function getSessionRepository() {
  if (!repository) {
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('xensi-sessions-v1') : null
    repository = new SessionRepository(localStorage, new IndexedSessionStorage(globalThis.indexedDB, localStorage), sessionCloud, sessionTabId(), sessionStorage, () => { channel?.postMessage('updated') })
    bindAccountCollection(repository, { guest: [], cache: () => 'xensi-sessions-update', receipt: () => 'xensi-sessions-receipt', guestEvent: 'xensi-sessions-updated' })
    window.addEventListener('online', () => { void repository?.refresh() })
    channel?.addEventListener('message', () => { void repository?.refresh() })
    // IndexedDB writes don't generate StorageEvents in other tabs.
    window.addEventListener('xensi-sessions-updated', () => { channel?.postMessage('updated') })
  }
  return repository
}
export function useSessionState() {
  const repo = getSessionRepository()
  return useSyncExternalStore(repo.subscribe, repo.getSnapshot, repo.getSnapshot)
}

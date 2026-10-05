import { describe, expect, it, vi } from 'vitest'
import { SessionRepository } from './sessionRepository'
import { SessionRecorder } from './sessionRecorder'
import { exerciseConfig, type TrainingSession, type RoutineRun } from './trainingSession'
import type { SessionCloud } from './sessionCloud'
import type { ActiveDocument, SessionDocument, SessionStorage } from './sessionStorage'
import type { AuthSessionState } from './authService'
import { createEmptyWarmupMetrics } from './warmupTelemetry'

const guest: AuthSessionState = { status: 'anonymous', userId: null, profile: null }
const account = (userId: string): AuthSessionState => ({ status: 'authenticated', userId, profile: { nickname: userId, avatarId: 'dog-happy' } })
class MemoryHistory implements SessionStorage {
  data = new Map<string, SessionDocument>(); queue = new Map<string, SessionDocument>(); receipts = new Set<string>(); anchors: ActiveDocument[] = []
  private key(doc: SessionDocument) { return `${doc.value.userId}:${doc.kind}:${doc.value.id}` }
  async sessions(owner: string | null) { return [...this.data.values()].filter(d => d.kind === 'session' && d.value.userId === owner).map(d => d.value as TrainingSession) }
  async runs(owner: string | null) { return [...this.data.values()].filter(d => d.kind === 'run' && d.value.userId === owner).map(d => d.value as RoutineRun) }
  async save(doc: SessionDocument, enqueue: boolean) { this.data.set(this.key(doc), structuredClone(doc)); if (enqueue) this.queue.set(this.key(doc), structuredClone(doc)) }
  async active(doc: ActiveDocument) { this.anchors.push(doc) }
  async remove(owner: string | null, id: string) { this.data.delete(`${owner}:session:${id}`); this.queue.delete(`${owner}:session:${id}`) }
  async recover() {}
  async pending(owner: string) { return [...this.queue.values()].filter(d => d.value.userId === owner) }
  async acknowledge(owner: string, docs: SessionDocument[]) { for (const doc of docs) if (doc.value.userId === owner && JSON.stringify(this.queue.get(this.key(doc))) === JSON.stringify(doc)) this.queue.delete(this.key(doc)) }
  async cache(owner: string, sessions: TrainingSession[]) { for (const [key, doc] of this.data) if (doc.kind === 'session' && doc.value.userId === owner) this.data.delete(key); for (const value of sessions) this.data.set(this.key({ kind: 'session', value }), { kind: 'session', value }) }
  async pendingGuest(owner: string) { return (await this.sessions(null)).filter(s => !this.receipts.has(`${owner}:${s.id}`)) }
  async receipt(owner: string, sessions: TrainingSession[]) { sessions.forEach(s => this.receipts.add(`${owner}:${s.id}`)) }
}
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) }, clear: () => data.clear(), key: index => [...data.keys()][index] ?? null, get length() { return data.size } }
}
function setup() {
  const database = new MemoryHistory(), remote = new Map<string, TrainingSession>()
  const failure = { offline: false, responseLost: false }
  const cloud: SessionCloud = {
    remove: vi.fn(async (owner: string,id: string) => { if (failure.offline) throw new Error('Offline'); if (remote.get(id)?.userId !== owner) throw new Error('Wrong owner'); remote.delete(id) }),
    fetch: vi.fn(async (owner: string) => [...remote.values()].filter(s => s.userId === owner)),
    append: vi.fn(async (owner: string, documents: SessionDocument[]) => {
      if (failure.offline) throw new Error('Offline')
      for (const doc of documents) {
        if (doc.value.userId !== owner) throw new Error('Wrong owner')
        if (doc.kind === 'session' && !remote.has(doc.value.id)) remote.set(doc.value.id, structuredClone(doc.value))
      }
      if (failure.responseLost) throw new Error('Response lost')
      return [...remote.values()].filter(s => s.userId === owner && documents.some(d => d.value.id === s.id))
    }),
  }
  const repository = new SessionRepository(memoryStorage(), database, cloud, 'tab')
  return { database, remote, failure, cloud, repository }
}
function record(repository: SessionRepository, owner: string | null) {
  const recorder = new SessionRecorder(repository, 'tab')
  recorder.start(owner, 'flick', { gameId: 'cs2', sensitivity: .65, dpi: 800 }, exerciseConfig('flick', 'easy', 'easy', 60, 1440, 900, 'dot'))
  return recorder.complete({ ...createEmptyWarmupMetrics(60), score: 100, hits: 1, shots: 1, accuracy: 100, remaining: 0 })!
}
describe('Sessions account repository', () => {
  it('deletes only the current guest session and preserves account data', async () => {
    const f = setup(); await f.repository.connect(guest)
    const session = record(f.repository, null)
    const other = { ...session, userId: 'a' }
    await f.database.save({ kind: 'session', value: other }, false)
    await vi.waitFor(() => expect(f.repository.getById(session.id)).not.toBeNull())
    await f.repository.remove(session)
    expect(f.repository.getAll()).toEqual([])
    expect(await f.database.sessions('a')).toHaveLength(1)
    expect(f.cloud.remove).not.toHaveBeenCalled()
  })
  it('confirms cloud deletion before removing the owner cache and rejects other owners', async () => {
    const f = setup(); await f.repository.connect(account('a'))
    const session = record(f.repository, 'a')
    await vi.waitFor(() => expect(f.remote.has(session.id)).toBe(true))
    f.failure.offline = true
    await expect(f.repository.remove(session)).rejects.toThrow('Offline')
    expect(f.repository.getById(session.id)).not.toBeNull()
    f.failure.offline = false
    await f.repository.remove(session)
    expect(f.remote.has(session.id)).toBe(false)
    expect(f.repository.getAll()).toEqual([])
    expect(await f.database.pending('a')).toEqual([])
    await f.repository.connect(account('b'))
    await expect(f.repository.remove(session)).rejects.toThrow()
    expect(f.cloud.remove).toHaveBeenCalledTimes(2)
  })
  it('preserves guest history across reload and never uploads without explicit consent', async () => {
    const f = setup(); await f.repository.connect(guest)
    const session = record(f.repository, null)
    await vi.waitFor(() => expect(f.repository.getById(session.id)).not.toBeNull())
    await f.repository.connect(account('a'))
    expect(f.cloud.append).not.toHaveBeenCalled(); expect(f.repository.getAll()).toEqual([])
    expect(f.repository.getSnapshot()).toMatchObject({ pendingImport: 1, importOffered: true })
    expect(await f.repository.importGuestSessions()).toBe(true)
    expect(f.remote.get(session.id)?.userId).toBe('a')
    expect(await f.database.sessions(null)).toHaveLength(1)
    await f.repository.refresh(); expect(f.repository.getSnapshot().pendingImport).toBe(0)
    await f.repository.connect(guest); expect(f.repository.getById(session.id)?.userId).toBeNull()
  })
  it('keeps owner-scoped durable pending uploads through logout and retries the same UUID', async () => {
    const f = setup(); await f.repository.connect(account('a')); f.failure.offline = true
    const session = record(f.repository, 'a')
    await vi.waitFor(() => expect(f.repository.getSnapshot().error).toBe('sync'))
    expect((await f.database.pending('a')).map(d => d.value.id)).toEqual([session.id])
    await f.repository.connect(guest); await f.repository.connect(account('b'))
    expect(f.repository.getAll()).toEqual([]); expect(await f.database.pending('a')).toHaveLength(1)
    f.failure.offline = false; await f.repository.connect(account('a'))
    expect(f.remote.get(session.id)?.userId).toBe('a'); expect(await f.database.pending('a')).toEqual([])
    expect(vi.mocked(f.cloud.append).mock.calls.every(([owner, docs]) => docs.every(d => d.value.userId === owner))).toBe(true)
  })
  it('handles committed uploads with lost responses without duplicates or false confirmation', async () => {
    const f = setup(); await f.repository.connect(account('a')); f.failure.responseLost = true
    const session = record(f.repository, 'a')
    await vi.waitFor(() => expect(f.repository.getSnapshot().error).toBe('sync'))
    expect(f.remote.size).toBe(1); expect(await f.database.pending('a')).toHaveLength(1)
    f.failure.responseLost = false; await f.repository.refresh()
    expect(f.remote.size).toBe(1); expect(f.repository.getById(session.id)).not.toBeNull(); expect(await f.database.pending('a')).toHaveLength(0)
  })
  it('clears visible history synchronously on auth loading and rejects delayed account caches', async () => {
    const f = setup(); await f.repository.connect(guest)
    record(f.repository, null); await vi.waitFor(() => expect(f.repository.getAll()).toHaveLength(1))
    await f.repository.connect({ status: 'loading', userId: null, profile: null })
    expect(f.repository.getAll()).toEqual([])
    let finish!: (items: TrainingSession[]) => void
    const original = f.database.sessions.bind(f.database)
    f.database.sessions = async owner => owner === 'a' ? new Promise(resolve => { finish = resolve }) : original(owner)
    const loading = f.repository.connect(account('a'))
    await f.repository.connect(account('b')); finish([record(f.repository, 'a')]); await loading
    expect(f.repository.getSnapshot()).toMatchObject({ userId: 'b', items: [] })
  })
  it('does not issue import receipts for a partially confirmed batch', async () => {
    const f = setup(); await f.repository.connect(guest)
    record(f.repository, null); await vi.waitFor(() => expect(f.repository.getAll()).toHaveLength(1))
    await f.repository.connect(account('a')); vi.mocked(f.cloud.append).mockResolvedValue([])
    expect(await f.repository.importGuestSessions()).toBe(false)
    expect(f.database.receipts.size).toBe(0); expect(await f.database.sessions(null)).toHaveLength(1)
  })
})

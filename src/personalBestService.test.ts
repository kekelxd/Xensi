import { describe, expect, it, vi } from 'vitest'
import { PersonalBestService } from './personalBestService'
import { compareSessionOrder, derivePersonalBests } from './personalBests'
import type { PersonalBestQuery } from './personalBestCloud'
import type { CollectionState } from './accountCollectionRepository'
import type { TrainingSession } from './trainingSession'
import { makeSession, ownerA, ownerB } from './testFixtures/sessions'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function fixture(local: TrainingSession[] = [], owner: string | null = null) {
  let state: CollectionState<TrainingSession> = { status: 'ready', userId: owner, items: local, pendingImport: 0, importOffered: false, busy: false, error: null }
  const listeners = new Set<() => void>()
  const data = { local, cloud: [] as TrainingSession[] }
  const fetch = vi.fn(async (user: string, query: PersonalBestQuery = {}) => derivePersonalBests(data.cloud.filter(s =>
    (!query.exerciseId || s.exerciseId === query.exerciseId)
    && (!query.comparisonSignature || s.comparisonSignature === query.comparisonSignature)
    && (!query.exerciseVersion || s.exerciseVersion === query.exerciseVersion)
    && (!query.beforeSessionId || compareSessionOrder(s, data.cloud.find(row => row.id === query.beforeSessionId)!) < 0)), user).map(best => best.session))
  const history = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    database: { sessions: vi.fn(async (user: string | null) => data.local.filter(s => s.userId === user)) },
    waitForSession: vi.fn(async (session: TrainingSession) => { if (!data.local.some(s => s.id === session.id)) throw new Error('Not persisted') }),
  }
  const service = new PersonalBestService(history, fetch)
  return { service, history, fetch, data, emit: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) } }
}

describe('Personal Best service ownership and persistence', () => {
  it('derives guest results without PB storage or a cloud request', async () => {
    const f = fixture([makeSession(100), makeSession(120, 2)])
    await vi.waitFor(() => expect(f.service.getAll()[0]?.value).toBe(120))
    expect(f.fetch).not.toHaveBeenCalled()
    expect(f.service.getForExercise('flick')).toHaveLength(1)
    expect(f.service.getForSession(makeSession(100))?.value).toBe(120)
    f.service.dispose()
  })
  it('clears guest on login and ignores delayed account A after switching to B', async () => {
    const f = fixture([makeSession(100)]), a = deferred<TrainingSession[]>()
    await vi.waitFor(() => expect(f.service.getAll()).toHaveLength(1))
    f.fetch.mockImplementationOnce(() => a.promise)
    f.emit({ userId: ownerA, status: 'data-loading' })
    expect(f.service.getAll()).toEqual([])
    f.emit({ status: 'ready' })
    f.data.cloud = [makeSession(50, 2, { userId: ownerB })]
    f.emit({ userId: ownerB })
    await vi.waitFor(() => expect(f.service.getAll()[0]?.value).toBe(50))
    a.resolve([makeSession(999, 3, { userId: ownerA })]); await a.promise
    expect(f.service.getAll()[0].userId).toBe(ownerB)
    f.emit({ userId: null })
    await vi.waitFor(() => expect(f.service.getAll()[0]?.value).toBe(100))
    expect(f.service.getAll()[0].userId).toBeNull()
    f.service.dispose()
  })
  it('does not invent a global PB from the last-300 cache when cloud fails', async () => {
    const session = makeSession(100, 1, { userId: ownerA }), f = fixture([session], ownerA)
    f.fetch.mockRejectedValue(new Error('offline'))
    await f.service.refresh()
    expect(f.service.getSnapshot().status).toBe('error')
    expect(f.service.getAll()).toEqual([])
    await expect(f.service.compareSessionToPB(session)).rejects.toThrow('offline')
    f.service.dispose()
  })
  it('waits for persistence before querying the prior comparable PB', async () => {
    const current = makeSession(140, 3, { userId: ownerA }), f = fixture([current], ownerA)
    f.data.cloud = [makeSession(100, 1, { userId: ownerA }), makeSession(120, 2, { userId: ownerA }), current]
    await f.service.refresh()
    const saved = deferred<void>(); f.history.waitForSession.mockImplementationOnce(() => saved.promise)
    f.fetch.mockClear()
    const result = f.service.compareSessionToPB(current)
    expect(f.fetch).not.toHaveBeenCalled()
    saved.resolve(); await expect(result).resolves.toMatchObject({ status: 'new', value: 140, previousValue: 120 })
    expect(f.fetch).toHaveBeenCalledWith(ownerA, { exerciseId: 'flick', comparisonSignature: current.comparisonSignature, exerciseVersion: 1, beforeSessionId: current.id })
    f.service.dispose()
  })
  it('rejects feedback when the owner changes during a completion request', async () => {
    const current = makeSession(140, 2, { userId: ownerA }), f = fixture([current], ownerA)
    const saved = deferred<void>(); f.history.waitForSession.mockImplementationOnce(() => saved.promise)
    const result = f.service.compareSessionToPB(current)
    const rejected = expect(result).rejects.toThrow('Account changed')
    f.emit({ userId: ownerB }); saved.resolve(); await rejected
    f.service.dispose()
  })
  it('rebuilds after deletion, import and refresh from another device', async () => {
    const f = fixture([], ownerA)
    f.data.cloud = [makeSession(100, 1, { userId: ownerA }), makeSession(120, 2, { userId: ownerA }), makeSession(110, 3, { userId: ownerA })]
    await f.service.refresh(); expect(f.service.getAll()[0].value).toBe(120)
    f.data.cloud.splice(1, 1); f.emit({ items: [] })
    await vi.waitFor(() => expect(f.service.getAll()[0]?.value).toBe(110))
    f.data.cloud.push(makeSession(140, 4, { userId: ownerA })); f.emit({ items: [] })
    await vi.waitFor(() => expect(f.service.getAll()[0]?.value).toBe(140))
    f.data.cloud.push(makeSession(160, 5, { userId: ownerA })); await f.service.refresh()
    expect(f.service.getAll()[0].value).toBe(160)
    f.service.dispose()
  })
})

import { expect, test } from '@playwright/test'
test.describe('Real IndexedDB session storage', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('button', { name: 'XENSI home' })).toBeVisible() })
  test('migrates legacy history once, preserves the original, and excludes unverified records from PB', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { IndexedSessionStorage } = await import('/src/sessionStorage.ts')
      const { evaluatePersonalBest } = await import('/src/personalBests.ts')
      const raw = JSON.stringify({ score: 100, accuracy: 80, completedAt: new Date().toISOString(), hits: 1, shots: 1, onTargetMs: 0, reactionTimeMs: 200, clickErrors: 0, bestStreak: 1, bestTrackingStreakMs: 0, overshootCount: 0, correctionCount: 0 })
      localStorage.setItem('sensi-warmup-session:v1:flick', raw)
      const database = new IndexedSessionStorage(indexedDB, localStorage, `migration-${crypto.randomUUID()}`)
      const first = await database.sessions(null), second = await database.sessions(null)
      return { first, second, original: localStorage.getItem('sensi-warmup-session:v1:flick'), raw, pb: evaluatePersonalBest(first[0], []) }
    })
    expect(result.first).toHaveLength(1); expect(result.first).toEqual(result.second); expect(result.original).toBe(result.raw)
    expect(result.first[0]).toMatchObject({ status: 'invalid', invalidReason: 'legacy_unverified', durationMs: 0, config: null, comparisonSignature: null })
    expect(result.pb).toBeNull()
  })
  test('reports corrupted legacy JSON without erasing it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { IndexedSessionStorage } = await import('/src/sessionStorage.ts')
      localStorage.setItem('sensi-warmup-session:v1:flick', '{bad json')
      const db = new IndexedSessionStorage(indexedDB, localStorage, `bad-${crypto.randomUUID()}`)
      let failed = false; try { await db.sessions(null) } catch { failed = true }
      return { failed, raw: localStorage.getItem('sensi-warmup-session:v1:flick') }
    })
    expect(result).toEqual({ failed: true, raw: '{bad json' })
  })
  test('recovers only this tab, keeps the UUID, and never fabricates elapsed gameplay or metrics', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { IndexedSessionStorage } = await import('/src/sessionStorage.ts')
      const { SessionRecorder } = await import('/src/sessionRecorder.ts')
      const { exerciseConfig } = await import('/src/trainingSession.ts')
      const db = new IndexedSessionStorage(indexedDB, localStorage, `recover-${crypto.randomUUID()}`)
      const tasks: Promise<void>[] = []
      const sink = { active: (doc: Parameters<typeof db.active>[0]) => { const task = db.active(doc); tasks.push(task); return task }, append: (doc: Parameters<typeof db.save>[0]) => db.save(doc, false) }
      const recorder = new SessionRecorder(sink, 'mine'), other = new SessionRecorder(sink, 'another-live-tab')
      const id = recorder.start(null, 'flick', { gameId: 'cs2', sensitivity: 1, dpi: 800 }, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
      other.start(null, 'flick', { gameId: 'cs2', sensitivity: 1, dpi: 800 }, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
      await Promise.all(tasks); await db.recover(null, 'mine'); const first = await db.sessions(null); await db.recover(null, 'mine')
      return { id, first, second: await db.sessions(null) }
    })
    expect(result.first).toEqual(result.second); expect(result.first).toHaveLength(1)
    expect(result.first[0]).toMatchObject({ id: result.id, status: 'interrupted', invalidReason: 'page_reload', durationMs: 0, metrics: null })
  })
  test('bounds guest history and per-user queue, preserving pending writes instead of dropping them', async ({ page }) => {
    test.setTimeout(120000)
    const result = await page.evaluate(async () => {
      const { IndexedSessionStorage, GUEST_SESSION_LIMIT, SESSION_PENDING_LIMIT } = await import('/src/sessionStorage.ts')
      const { SessionRecorder } = await import('/src/sessionRecorder.ts')
      const { exerciseConfig } = await import('/src/trainingSession.ts')
      const { createEmptyWarmupMetrics } = await import('/src/warmupTelemetry.ts')
      const name = `volume-${crypto.randomUUID()}`, database = new IndexedSessionStorage(indexedDB, localStorage, name)
      const recorder = new SessionRecorder({ active: async () => {}, append: async () => {} }, 'fixture')
      recorder.start(null, 'flick', { gameId: 'cs2', sensitivity: 1, dpi: 800 }, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
      const base = recorder.complete({ ...createEmptyWarmupMetrics(60), remaining: 0, score: 100, hits: 1, shots: 1, accuracy: 100 })!
      await database.sessions(null)
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      // Populate a larger existing history atomically, then exercise the public append retention path.
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents')
        for (let i = 0; i < GUEST_SESSION_LIMIT + 10; i++) {
          const value = { ...base, id: crypto.randomUUID(), startedAt: new Date(1700000000000 + i).toISOString() }
          store.put({ key: `guest:session:${value.id}`, scope: 'guest', kind: 'session', value })
        }
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
      }); db.close()
      await database.save({ kind: 'session', value: base }, false)
      const owner = crypto.randomUUID()
      for (let i = 0; i < SESSION_PENDING_LIMIT; i++) await database.save({ kind: 'session', value: { ...base, id: crypto.randomUUID(), userId: owner } }, true)
      let full = false; try { await database.save({ kind: 'session', value: { ...base, id: crypto.randomUUID(), userId: owner } }, true) } catch { full = true }
      const pending = await database.pending(owner), cached = await database.sessions(owner), guest = await database.sessions(null)
      return { guestCount: guest.length, pendingCount: pending.length, cacheCount: cached.length, full,
        guestIdRetained: guest.some(s => s.id === base.id), allOwned: pending.every(doc => doc.value.userId === owner), guestPending: (await database.pending(crypto.randomUUID())).length }
    })
    expect(result).toEqual({ guestCount: 3000, pendingCount: 500, cacheCount: 300, full: true, guestIdRetained: true, allOwned: true, guestPending: 0 })
  })
  test('an old running-run acknowledgement cannot erase its newer terminal state', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { IndexedSessionStorage } = await import('/src/sessionStorage.ts')
      const db = new IndexedSessionStorage(indexedDB, localStorage, `ack-${crypto.randomUUID()}`), owner = crypto.randomUUID()
      const running = { kind: 'run' as const, value: { id: crypto.randomUUID(), userId: owner, routineId: null, routineName: 'Run', startedAt: new Date().toISOString(), finishedAt: null, durationMs: 0, status: 'running' as const, invalidReason: null, schemaVersion: 1 as const } }
      await db.save(running, true)
      const completed = { kind: 'run' as const, value: { ...running.value, status: 'completed' as const, finishedAt: new Date().toISOString(), durationMs: 60000 } }
      await db.save(completed, true); await db.acknowledge(owner, [running])
      const pending = await db.pending(owner); await db.acknowledge(owner, [completed])
      return { pending, after: await db.pending(owner) }
    })
    expect(result.pending).toHaveLength(1); expect(result.pending[0].value.status).toBe('completed'); expect(result.after).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { RoutineRepository, createRoutineCloud, type RoutineCloud } from './routineRepository'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDefaultRoutine, ROUTINE_LIBRARY_STORAGE_KEY, CUSTOM_ROUTINE_STORAGE_KEY, type CustomRoutine } from './routineConfig'
import { readGuestRoutines, routineBackupKey, routineCacheKey, routineReceiptKey } from './routineStorage'
import type { AuthSessionState } from './authService'

const guest: AuthSessionState = { status: 'anonymous', userId: null, profile: null }
const account = (id = 'a'): AuthSessionState => ({ status: 'authenticated', userId: id, profile: { nickname: id, avatarId: 'dog-happy' } })
function setup() {
  const data = new Map<string, string>()
  const storage: Storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) }, clear: () => data.clear(), key: i => [...data.keys()][i] ?? null, get length() { return data.size } }
  const accounts = new Map<string, CustomRoutine[]>()
  const cloud: RoutineCloud = {
    getAll: vi.fn(async id => structuredClone(accounts.get(id) ?? [])),
    save: vi.fn(async (routine, _new, id) => { const saved = { ...routine, updatedAt: new Date().toISOString() }; accounts.set(id, [saved, ...(accounts.get(id) ?? []).filter(item => item.id !== routine.id)]); return structuredClone(saved) }),
    remove: vi.fn(async (id, owner) => { accounts.set(owner, (accounts.get(owner) ?? []).filter(item => item.id !== id)) }),
    importRoutines: vi.fn(async (items, owner) => { const result = accounts.get(owner) ?? []; for (const item of items) if (!result.some(saved => saved.id === item.id)) result.push(structuredClone(item)); accounts.set(owner, result); return structuredClone(result) }),
  }
  const repository = new RoutineRepository(storage, cloud, storage)
  return { repository, storage, accounts, cloud }
}
describe('shared account collection lifecycle for routines', () => {
  it('supports guest CRUD, stable step identities, rename, duplicate, reorder and reload without cloud calls', async () => {
    const { repository, storage, cloud } = setup()
    await repository.connect(guest)
    const routine = createDefaultRoutine()
    expect(await repository.create(routine)).toBe(true)
    expect(await repository.reorder(routine.id, routine.items.map(item => item.id).reverse())).toBe(true)
    expect(repository.getById(routine.id)!.items.map(item => item.id)).toEqual(routine.items.map(item => item.id).reverse())
    expect(await repository.rename(routine.id, 'Renamed')).toBe(true)
    expect(await repository.duplicate(routine.id, ' - copy')).toBe(true)
    const copy = repository.getAll().find(item => item.id !== routine.id)!
    expect(copy.name).toBe('Renamed - copy')
    expect(copy.items.every(item => !routine.items.some(old => old.id === item.id))).toBe(true)
    const reload = new RoutineRepository(storage, cloud)
    await reload.connect(guest)
    expect(reload.getAll()).toHaveLength(2)
    await reload.remove(copy.id)
    await reload.refresh()
    expect(reload.getAll()).toHaveLength(1)
    expect(cloud.save).not.toHaveBeenCalled()
  })
  it('backs up both legacy documents and converts routine/step IDs exactly once', () => {
    const { storage } = setup()
    const item = createDefaultRoutine(); item.id = 'old'; item.items.forEach(step => { step.id = 'old-step' })
    const raw = JSON.stringify([item]); storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, raw)
    storage.setItem(CUSTOM_ROUTINE_STORAGE_KEY, JSON.stringify(item))
    const first = readGuestRoutines(storage), second = readGuestRoutines(storage)
    expect(second).toEqual(first)
    expect(first[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(first[0].items.map(step => step.id)).size).toBe(3)
    expect(JSON.parse(storage.getItem(routineBackupKey)!).library).toBe(raw)
    expect(storage.getItem(CUSTOM_ROUTINE_STORAGE_KEY)).toBe(JSON.stringify(item))
  })
  it('migrates the single legacy routine and never resurrects it after deleting the library entry', async () => {
    const { storage, cloud } = setup()
    storage.setItem(CUSTOM_ROUTINE_STORAGE_KEY, JSON.stringify(createDefaultRoutine()))
    const repository = new RoutineRepository(storage, cloud)
    await repository.connect(guest)
    await repository.remove(repository.getAll()[0].id)
    await repository.refresh()
    expect(repository.getAll()).toEqual([])
  })
  it('retains malformed original storage without replacement or claiming success', async () => {
    const { storage, cloud } = setup()
    storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, '{invalid')
    const repository = new RoutineRepository(storage, cloud)
    await repository.connect(guest)
    expect(repository.getSnapshot().error).toBe('sync')
    expect(await repository.create(createDefaultRoutine())).toBe(false)
    expect(storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)).toBe('{invalid')
  })
  it('preserves removed exercises, allows renaming an old routine and rejects starting definitions with unavailable modes', async () => {
    const { storage, cloud } = setup()
    const item = createDefaultRoutine(); item.items[0].modeId = 'removed-mode' as typeof item.items[0]['modeId']
    storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, JSON.stringify([item]))
    const repository = new RoutineRepository(storage, cloud); await repository.connect(guest)
    expect(repository.getById(item.id)?.items).toHaveLength(3)
    expect(await repository.rename(item.id, 'Old routine')).toBe(true)
    expect(repository.getById(item.id)?.items[0].modeId).toBe('removed-mode')
    const current = repository.getById(item.id)!
    expect(await repository.update({ ...current, items: [...current.items, { ...createDefaultRoutine().items[0], order: 3 }] })).toBe(true)
    expect(await repository.duplicate(item.id, ' - copy')).toBe(true)
    expect(repository.getAll().find(copy => copy.id !== item.id)?.items[0].modeId).toBe('removed-mode')
  })
  it('isolates guest, account A, account B and restores each account from cloud on reload', async () => {
    const { repository, storage, cloud, accounts } = setup()
    await repository.connect(guest); await repository.create(createDefaultRoutine())
    const original = storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)
    await repository.connect(account()); expect(repository.getAll()).toEqual([])
    const item = createDefaultRoutine(); await repository.create(item)
    expect(storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)).toBe(original)
    expect(JSON.parse(storage.getItem(routineCacheKey('a'))!)).toHaveLength(1)
    await repository.connect(account('b')); expect(repository.getAll()).toEqual([])
    const otherDevice = new RoutineRepository(storage, cloud); await otherDevice.connect(account())
    expect(otherDevice.getById(item.id)).not.toBeNull()
    await repository.connect(guest); expect(repository.getAll()[0].id).not.toBe(item.id)
    expect(accounts.get('a')).toHaveLength(1)
  })
  it('fetches before import, requires consent, preserves cloud UUID matches and imports differing UUIDs idempotently', async () => {
    const { repository, storage, accounts, cloud } = setup()
    await repository.connect(guest); const item = createDefaultRoutine(); await repository.create(item)
    accounts.set('a', [{ ...item, name: 'Cloud wins' }, { ...createDefaultRoutine(), name: item.name }])
    await repository.connect(account())
    expect(repository.getAll()).toHaveLength(2); expect(repository.getSnapshot().pendingImport).toBe(1)
    expect(cloud.importRoutines).not.toHaveBeenCalled()
    repository.dismissImport(); await repository.refresh(); expect(repository.getSnapshot().importOffered).toBe(false)
    repository.offerImport(); expect(await repository.importGuestRoutines()).toBe(true)
    expect(repository.getById(item.id)?.name).toBe('Cloud wins')
    await repository.importGuestRoutines(); await repository.refresh(); expect(repository.getAll()).toHaveLength(2)
    expect(JSON.parse(storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)!)[0].name).toBe(item.name)
  })
  it('does not mark receipts after response loss; retry preserves exactly one cloud UUID', async () => {
    const { repository, cloud, storage } = setup()
    await repository.connect(guest); await repository.create(createDefaultRoutine()); await repository.connect(account())
    const original = cloud.importRoutines
    cloud.importRoutines = async (items, owner) => { await original(items, owner); throw new Error('Response lost') }
    expect(await repository.importGuestRoutines()).toBe(false)
    expect(storage.getItem(routineReceiptKey('a'))).toBeNull()
    cloud.importRoutines = original
    expect(await repository.importGuestRoutines()).toBe(true)
    expect(repository.getAll()).toHaveLength(1)
  })
  it('ignores old fetches and mutations after account switching', async () => {
    const { repository, cloud } = setup()
    let resolve!: (items: CustomRoutine[]) => void
    cloud.getAll = vi.fn(id => id === 'a' ? new Promise<CustomRoutine[]>(done => { resolve = done }) : Promise.resolve([]))
    const loading = repository.connect(account())
    expect(repository.getSnapshot().items).toEqual([])
    await repository.connect(account('b')); resolve([createDefaultRoutine()]); await loading
    expect(repository.getAll()).toEqual([])
    let save!: (item: CustomRoutine) => void
    cloud.save = vi.fn(() => new Promise<CustomRoutine>(done => { save = done }))
    const item = createDefaultRoutine(), mutation = repository.create(item)
    await repository.connect(guest); save(item)
    expect(await mutation).toBe(false); expect(repository.getById(item.id)).toBeNull()
  })
  it('retains last confirmed cache and reports failures without optimistic success', async () => {
    const { repository, cloud } = setup()
    await repository.connect(account()); const item = createDefaultRoutine(); await repository.create(item)
    cloud.save = vi.fn(async () => { throw new Error('SQL private error') })
    expect(await repository.rename(item.id, 'Failed')).toBe(false)
    expect(repository.getById(item.id)?.name).toBe(item.name)
    expect(repository.getSnapshot().error).toBe('sync')
    cloud.getAll = vi.fn(async () => { throw new Error('Offline') }); await repository.refresh()
    expect(repository.getById(item.id)?.name).toBe(item.name)
  })
  it('rejects empty routines, invalid configuration and non-permutation reorder', async () => {
    const { repository } = setup(); await repository.connect(guest)
    const item = createDefaultRoutine(); expect(await repository.create({ ...item, items: [] })).toBe(false)
    await repository.create(item)
    expect(await repository.reorder(item.id, [item.items[0].id])).toBe(false)
    expect(await repository.reorder(item.id, item.items.map(() => item.items[0].id))).toBe(false)
    expect(repository.getById(item.id)?.items).toHaveLength(3)
  })
  it('reads complete definitions through one atomic RPC, including more than 1000 steps', async () => {
    const item = createDefaultRoutine()
    const rpc = vi.fn(async () => ({ error: null, data: [{ id: item.id, user_id: 'a', name: item.name, game_id: item.gameId, preset_id: null,
      created_at: item.createdAt, updated_at: item.updatedAt, training_routine_steps: Array.from({ length: 1001 }, (_, position) => ({ id: crypto.randomUUID(), position, exercise_id: 'tracking', duration_seconds: 60, difficulty: 'adaptive' })) }] }))
    const cloud = createRoutineCloud(() => ({ rpc }) as unknown as SupabaseClient)
    expect((await cloud.getAll('a'))[0].items).toHaveLength(1001)
    expect(rpc).toHaveBeenCalledWith('xensi_get_training_routines')
    await expect(cloud.getAll('b')).rejects.toThrow('Session changed')
  })
  it('retains legacy preset references without using positions after the preset list was reordered', () => {
    const { storage } = setup(), item = createDefaultRoutine('cs2', 'legacy-preset')
    const preset = { id: 'legacy-preset', gameId: 'cs2', sensitivity: .7, dpi: 800, createdAt: '2026-01-01' }
    const newId = crypto.randomUUID()
    storage.setItem('xensi-player-profile:pre-presets-v1', JSON.stringify({ presets: [preset] }))
    storage.setItem('xensi-player-profile', JSON.stringify({ presets: [{ ...preset, id: crypto.randomUUID(), sensitivity: 1.2 }, { ...preset, id: newId }] }))
    storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, JSON.stringify([item]))
    expect(readGuestRoutines(storage)[0].presetId).toBe(newId)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { PresetRepository, type PresetCloud } from './presetRepository'
import { importReceiptKey, presetCacheKey, readGuestPresets } from './presetStorage'
import { PLAYER_PROFILE_STORAGE_KEY, type SensitivityPreset } from './playerProfileStore'
import type { AuthSessionState } from './authService'

const guest: AuthSessionState = { status: 'anonymous', userId: null, profile: null }
const account = (userId = 'account-a'): AuthSessionState => ({ status: 'authenticated', userId, profile: { nickname: userId, avatarId: 'dog-happy' } })
const input = { gameId: 'cs2' as const, sensitivity: .65, dpi: 800 }
function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) }, clear: () => data.clear(), key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size } } satisfies Storage
}
const preset = (patch: Partial<SensitivityPreset> = {}): SensitivityPreset => ({
  ...input, id: crypto.randomUUID(), createdAt: '2026-09-05T12:00:00.000Z', updatedAt: '2026-09-05T12:00:00.000Z', isPrimary: true, ...patch,
})
function setup() {
  const storage = memoryStorage()
  const accounts = new Map<string, SensitivityPreset[]>()
  const cloud: PresetCloud = {
    getAll: vi.fn(async userId => structuredClone(accounts.get(userId) ?? [])),
    save: vi.fn(async (id, values, createNew, userId) => {
      const all = accounts.get(userId) ?? []
      const previous = all.find(item => item.id === id)
      if (!createNew && !previous) throw new Error('Missing')
      const next = { ...values, id, createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }
      let result = createNew ? [...all, next] : all.map(item => item.id === id ? next : item)
      if (values.isPrimary) result = result.map(item => ({ ...item, isPrimary: item.id === id }))
      accounts.set(userId, result)
      return structuredClone(result)
    }),
    remove: vi.fn(async (id, userId) => { accounts.set(userId, (accounts.get(userId) ?? []).filter(item => item.id !== id)) }),
    setPrimary: vi.fn(async (id, userId) => {
      const result = (accounts.get(userId) ?? []).map(item => ({ ...item, isPrimary: item.id === id }))
      accounts.set(userId, result); return structuredClone(result)
    }),
    importGuestPresets: vi.fn(async (presets: SensitivityPreset[], userId: string) => {
      const result = structuredClone(accounts.get(userId) ?? [])
      const primary = result.find(item => item.isPrimary)?.id ?? presets.find(item => item.isPrimary)?.id
      for (const item of presets) if (!result.some(existing => existing.id === item.id)) result.push({ ...item, isPrimary: false })
      for (const item of result) item.isPrimary = item.id === primary
      accounts.set(userId, result); return structuredClone(result)
    }),
  }
  const repository = new PresetRepository(storage, cloud)
  return { storage, accounts, cloud, repository }
}

describe('presets persistence and account isolation', () => {
  it('keeps guest CRUD, stable UUIDs, timestamps and a single primary across reloads', async () => {
    const { repository, storage, cloud } = setup()
    expect(repository.getAll()).toEqual([])
    await repository.connect(guest)
    expect(await repository.create(input)).toBe(true)
    const first = repository.getAll()[0]
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await repository.create({ ...input, gameId: 'valorant' })).toBe(true)
    const second = repository.getAll()[1]
    await repository.setPrimary(second.id)
    expect(repository.getAll().filter(item => item.isPrimary).map(item => item.id)).toEqual([second.id])
    await repository.update(first.id, { ...input, sensitivity: .8, name: 'Updated' })
    const reloaded = new PresetRepository(storage, cloud)
    await reloaded.connect(guest)
    expect(reloaded.getById(first.id)).toMatchObject({ sensitivity: .8, name: 'Updated', createdAt: first.createdAt })
    await reloaded.remove(first.id)
    await reloaded.refresh()
    expect(reloaded.getAll()).toHaveLength(1)
    expect(cloud.save).not.toHaveBeenCalled()
  })
  it('migrates legacy IDs once, retains unknown data and backs up the original document', () => {
    const { storage } = setup()
    const raw = JSON.stringify({ nickname: 'Guest', extra: { keep: true }, games: [{ id: 'cs2', sensitivity: .65, dpi: 800 }, { id: 'pubg', sensitivity: 50, dpi: 800 }] })
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, raw)
    const first = readGuestPresets(storage)
    expect(first).toHaveLength(2)
    expect(readGuestPresets(storage)).toEqual(first)
    expect(storage.getItem('xensi-player-profile:pre-presets-v1')).toBe(raw)
    expect(JSON.parse(storage.getItem(PLAYER_PROFILE_STORAGE_KEY)!)).toHaveProperty('extra.keep', true)
  })
  it('preserves malformed guest data and reports an error instead of erasing it', async () => {
    const { repository, storage } = setup()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, '{bad json')
    await repository.connect(guest)
    expect(repository.getSnapshot().error).toBe('sync')
    expect(await repository.create(input)).toBe(false)
    expect(storage.getItem(PLAYER_PROFILE_STORAGE_KEY)).toBe('{bad json')
  })
  it('offers import, dismisses once, reoffers manually, merges UUIDs and keeps cloud primary', async () => {
    const { repository, storage, accounts } = setup()
    const local = [preset(), preset({ isPrimary: false }), preset({ isPrimary: false })]
    const remote = [preset(), ...Array.from({ length: 3 }, () => preset({ isPrimary: false }))]
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: local }))
    accounts.set('account-a', remote)
    await repository.connect(account())
    expect(repository.getAll()).toEqual(remote)
    expect(repository.getSnapshot()).toMatchObject({ importOffered: true, pendingImport: 3 })
    repository.dismissImport()
    await repository.refresh()
    expect(repository.getSnapshot().importOffered).toBe(false)
    expect(readGuestPresets(storage)).toEqual(local)
    repository.offerImport()
    expect(await repository.importGuestPresets()).toBe(true)
    expect(repository.getAll()).toHaveLength(7)
    expect(repository.getAll().filter(item => item.isPrimary).map(item => item.id)).toEqual([remote[0].id])
    expect(readGuestPresets(storage)).toEqual(local)
    const reloaded = new PresetRepository(storage, setup().cloud)
    await reloaded.connect(account())
    expect(reloaded.getSnapshot().importOffered).toBe(false)
    expect(await repository.importGuestPresets()).toBe(true)
    expect(repository.getAll()).toHaveLength(7)
  })
  it('adopts guest primary on an empty account and preserves cloud values on UUID collisions', async () => {
    const { repository, storage, accounts } = setup()
    const local = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [local] }))
    accounts.set('account-a', [{ ...local, sensitivity: .9, isPrimary: false }])
    await repository.connect(account())
    await repository.importGuestPresets()
    expect(repository.getAll()).toHaveLength(1)
    expect(repository.getAll()[0].sensitivity).toBe(.9)
    expect(repository.getAll()[0].isPrimary).toBe(true)
    expect(repository.getAll()[0].id).toBe(local.id)
  })
  it('adopts guest primary for a new account', async () => {
    const { repository, storage } = setup()
    const local = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [local] }))
    await repository.connect(account())
    await repository.importGuestPresets()
    expect(repository.getAll()[0]).toMatchObject({ id: local.id, isPrimary: true })
  })
  it('retains guest originals and receipts on failed or incomplete imports, then retries safely', async () => {
    const { repository, storage, cloud } = setup()
    const local = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [local] }))
    await repository.connect(account())
    vi.mocked(cloud.importGuestPresets).mockRejectedValueOnce(new Error('Offline'))
    expect(await repository.importGuestPresets()).toBe(false)
    expect(repository.getSnapshot()).toMatchObject({ error: 'import', importOffered: true })
    expect(storage.getItem(importReceiptKey('account-a'))).toBeNull()
    vi.mocked(cloud.importGuestPresets).mockResolvedValueOnce([])
    expect(await repository.importGuestPresets()).toBe(false)
    expect(storage.getItem(importReceiptKey('account-a'))).toBeNull()
    expect(readGuestPresets(storage)[0].id).toBe(local.id)
    expect(await repository.importGuestPresets()).toBe(true)
  })
  it('never renders guest while auth loads and disconnects account A before loading account B', async () => {
    const { repository, storage, accounts, cloud } = setup()
    const local = preset(), remoteA = preset(), remoteB = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [local] }))
    accounts.set('account-a', [remoteA]); accounts.set('account-b', [remoteB])
    await repository.connect({ status: 'loading', userId: null, profile: null })
    expect(repository.getAll()).toEqual([])
    await repository.connect(account())
    expect(repository.getAll()).toEqual([remoteA])
    await repository.connect(guest)
    expect(repository.getAll()).toEqual([local])
    let finish!: (value: SensitivityPreset[]) => void
    vi.mocked(cloud.getAll).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const loadingB = repository.connect(account('account-b'))
    expect(repository.getSnapshot()).toMatchObject({ status: 'presets-loading', userId: 'account-b', presets: [] })
    finish([remoteB]); await loadingB
    expect(repository.getAll()).toEqual([remoteB])
    expect(storage.getItem(presetCacheKey('account-a'))).not.toBeNull()
  })
  it('ignores late responses after logout/account switch', async () => {
    const { repository, cloud } = setup()
    let finish!: (value: SensitivityPreset[]) => void
    vi.mocked(cloud.getAll).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const loading = repository.connect(account())
    await repository.connect(guest)
    finish([preset()]); await loading
    expect(repository.getSnapshot()).toMatchObject({ userId: null, presets: [] })
  })
  it('keeps the previous state on every failed cloud mutation and retries', async () => {
    const { repository, cloud, accounts } = setup()
    const original = preset()
    accounts.set('account-a', [original])
    await repository.connect(account())
    vi.mocked(cloud.save).mockRejectedValueOnce(new Error('Offline'))
    expect(await repository.update(original.id, { ...input, sensitivity: .8 })).toBe(false)
    expect(repository.getAll()).toEqual([original])
    vi.mocked(cloud.remove).mockRejectedValueOnce(new Error('Offline'))
    expect(await repository.remove(original.id)).toBe(false)
    vi.mocked(cloud.setPrimary).mockRejectedValueOnce(new Error('Offline'))
    expect(await repository.setPrimary(original.id)).toBe(false)
    expect(repository.getAll()).toEqual([original])
    expect(await repository.update(original.id, { ...input, sensitivity: .8 })).toBe(true)
    await repository.refresh()
    expect(repository.getAll()[0].sensitivity).toBe(.8)
  })
  it('serializes double-click imports and supports multi-device fetches and cloud CRUD', async () => {
    const { repository, storage, cloud } = setup()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [preset()] }))
    await repository.connect(account())
    const importing = repository.importGuestPresets()
    expect(await repository.importGuestPresets()).toBe(false)
    expect(await importing).toBe(true)
    await repository.create(input)
    const deviceB = new PresetRepository(memoryStorage(), cloud)
    await deviceB.connect(account())
    expect(deviceB.getAll()).toEqual(repository.getAll())
    const id = repository.getAll()[1].id
    await deviceB.setPrimary(id)
    await repository.refresh()
    expect(repository.getById(id)?.isPrimary).toBe(true)
    await deviceB.remove(id)
    await repository.refresh()
    expect(repository.getById(id)).toBeNull()
  })
  it('rejects invalid inputs without touching cloud data', async () => {
    const { repository, cloud } = setup()
    await repository.connect(account())
    expect(await repository.create({ ...input, dpi: 0 })).toBe(false)
    expect(await repository.create({ ...input, sensitivity: Infinity })).toBe(false)
    expect(cloud.save).not.toHaveBeenCalled()
  })
  it('keeps an explicit absence of guest primary after reload', async () => {
    const { repository, storage, cloud } = setup()
    await repository.connect(guest)
    await repository.create(input)
    const id = repository.getAll()[0].id
    await repository.update(id, { ...input, isPrimary: false })
    const reloaded = new PresetRepository(storage, cloud)
    await reloaded.connect(guest)
    expect(reloaded.getAll()[0].isPrimary).toBe(false)
  })
  it('preserves duplicate legacy UUID entities while giving them distinct stable IDs and one primary', () => {
    const { storage } = setup()
    const original = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [original, { ...original, id: original.id.toUpperCase(), sensitivity: .9 }] }))
    const migrated = readGuestPresets(storage)
    expect(new Set(migrated.map(item => item.id)).size).toBe(2)
    expect(migrated.map(item => item.sensitivity)).toEqual([.65, .9])
    expect(migrated.filter(item => item.isPrimary)).toHaveLength(1)
    expect(readGuestPresets(storage)).toEqual(migrated)
  })
  it('preserves cloud data if guest import data is corrupt', async () => {
    const { repository, storage, accounts } = setup()
    const remote = preset()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, '{bad json')
    accounts.set('account-a', [remote])
    await repository.connect(account())
    expect(repository.getAll()).toEqual([remote])
    expect(repository.getSnapshot().error).toBe('import')
  })
  it('preserves an explicit dismissal across page reloads and resets it on logout', async () => {
    const { storage, cloud } = setup()
    const offers = memoryStorage()
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ presets: [preset()] }))
    const first = new PresetRepository(storage, cloud, offers)
    await first.connect(account()); first.dismissImport()
    const reloaded = new PresetRepository(storage, cloud, offers)
    await reloaded.connect(account())
    expect(reloaded.getSnapshot().importOffered).toBe(false)
    await reloaded.connect(guest); await reloaded.connect(account())
    expect(reloaded.getSnapshot().importOffered).toBe(true)
  })
})

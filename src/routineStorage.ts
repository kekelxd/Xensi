import { isUUID, markImported, readImportReceipts } from './accountCollectionRepository'
import { CUSTOM_ROUTINE_STORAGE_KEY, ROUTINE_LIBRARY_STORAGE_KEY, normalizeRoutine, type CustomRoutine } from './routineConfig'

type RoutineStorage = Pick<Storage, 'getItem' | 'setItem'>
export const routineCacheKey = (id: string) => `xensi-routines:user:${id}:v1`
export const routineReceiptKey = (id: string) => `xensi-routines:imported:${id}:v1`
export const routineBackupKey = 'xensi-routines:pre-sync-v1'
export const sortRoutines = (items: CustomRoutine[]) => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))

export function readGuestRoutines(storage: RoutineStorage): CustomRoutine[] {
  const library = storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)
  const custom = storage.getItem(CUSTOM_ROUTINE_STORAGE_KEY)
  const value: unknown = library !== null ? JSON.parse(library) : custom ? [JSON.parse(custom)] : []
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || !Array.isArray(item.items))) throw new Error('Invalid routine storage')
  const seen = new Set<string>(), steps = new Set<string>()
  const id = (old: string, ids: Set<string>) => {
    const canonical = old.toLowerCase()
    const next = isUUID(canonical) && !ids.has(canonical) ? canonical : crypto.randomUUID()
    ids.add(next)
    return next
  }
  // Presets migrate before routines; retain references to the same legacy preset.
  const oldProfile = storage.getItem('xensi-player-profile:pre-presets-v1')
  const newProfile = storage.getItem('xensi-player-profile')
  const presetIds = new Map<string, string>()
  try {
    const old = JSON.parse(oldProfile ?? '{}').presets ?? [], current = JSON.parse(newProfile ?? '{}').presets ?? []
    const identity = (preset: Record<string, unknown>) => JSON.stringify([preset.gameId, preset.name ?? '', preset.sensitivity, preset.dpi, preset.createdAt])
    old.forEach((preset: { id: string }) => {
      const matches = current.filter((item: Record<string, unknown>) => identity(item) === identity(preset))
      if (matches.length === 1) presetIds.set(preset.id, matches[0].id)
    })
  } catch { /* Invalid profile data does not destroy routine definitions. */ }
  const routines = sortRoutines(value.map(raw => {
    const routine = normalizeRoutine(raw)
    return { ...routine, id: id(routine.id, seen), presetId: routine.presetId ? presetIds.get(routine.presetId) ?? routine.presetId : undefined,
      items: routine.items.map(item => ({ ...item, id: id(item.id, steps) })) }
  }))
  const encoded = JSON.stringify(routines)
  if (library !== encoded && (library !== null || custom !== null)) {
    if (!storage.getItem(routineBackupKey)) storage.setItem(routineBackupKey, JSON.stringify({ library, custom }))
    storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, encoded)
  }
  return routines
}
export function writeGuestRoutines(storage: RoutineStorage, routines: CustomRoutine[]) {
  const result = sortRoutines(routines)
  storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, JSON.stringify(result))
  return result
}
export function readRoutineCache(storage: RoutineStorage, id: string): CustomRoutine[] {
  try {
    const value = JSON.parse(storage.getItem(routineCacheKey(id)) ?? '[]')
    return Array.isArray(value) && value.every(item => item && typeof item === 'object' && isUUID(item.id) && Array.isArray(item.items))
      ? sortRoutines(value.map(item => normalizeRoutine(item))) : []
  } catch { return [] }
}
export const routineFingerprint = (routine: CustomRoutine) => JSON.stringify(routine)
export function pendingGuestRoutines(storage: RoutineStorage, id: string) {
  const receipts = readImportReceipts(storage, routineReceiptKey(id))
  return readGuestRoutines(storage).filter(item => receipts[item.id] !== routineFingerprint(item))
}
export const markGuestRoutinesImported = (storage: RoutineStorage, id: string, items: CustomRoutine[]) => markImported(storage, routineReceiptKey(id), items, routineFingerprint)

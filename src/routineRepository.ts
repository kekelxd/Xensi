import type { SupabaseClient } from '@supabase/supabase-js'
import { AccountCollectionRepository, bindAccountCollection, isUUID } from './accountCollectionRepository'
import { getSupabaseClient } from './supabaseClient'
import { GAME_SENSITIVITY_PROFILE_BY_ID } from './gameSensitivityProfiles'
import { CUSTOM_ROUTINE_STORAGE_KEY, ROUTINE_LIBRARY_STORAGE_KEY, createRoutineId, isRoutineModeAvailable, normalizeRoutine, validateRoutine, type CustomRoutine } from './routineConfig'
import { markGuestRoutinesImported, pendingGuestRoutines, readGuestRoutines, readRoutineCache, routineCacheKey, routineReceiptKey, sortRoutines, writeGuestRoutines } from './routineStorage'

export interface RoutineCloud {
  getAll(userId: string): Promise<CustomRoutine[]>
  save(routine: CustomRoutine, createNew: boolean, userId: string): Promise<CustomRoutine>
  remove(id: string, userId: string): Promise<void>
  importRoutines(items: CustomRoutine[], userId: string): Promise<CustomRoutine[]>
}
type RoutineRow = { id: string; user_id: string; name: string; game_id: CustomRoutine['gameId']; preset_id: string | null; created_at: string; updated_at: string;
  training_routine_steps: { id: string; position: number; exercise_id: CustomRoutine['items'][number]['modeId']; duration_seconds: number; difficulty: CustomRoutine['items'][number]['difficulty'] }[] }
const fromRow = (row: RoutineRow) => normalizeRoutine({ id: row.id, name: row.name, gameId: row.game_id, presetId: row.preset_id ?? undefined,
  createdAt: row.created_at, updatedAt: row.updated_at, items: row.training_routine_steps.map(step => ({ id: step.id, order: step.position, modeId: step.exercise_id, durationSeconds: step.duration_seconds, difficulty: step.difficulty })) })
const toDefinition = (routine: CustomRoutine) => ({ id: routine.id, name: routine.name, game_id: routine.gameId, preset_id: routine.presetId ?? null,
  steps: [...routine.items].sort((a, b) => a.order - b.order).map((step, position) => ({ id: step.id, position, exercise_id: step.modeId, duration_seconds: step.durationSeconds, difficulty: step.difficulty })) })

export function createRoutineCloud(getClient: () => SupabaseClient | null): RoutineCloud {
  const client = () => { const value = getClient(); if (!value) throw new Error('Supabase unavailable'); return value }
  const rows = (data: unknown, error: unknown) => { if (error || !Array.isArray(data)) throw new Error('Routine request failed'); return sortRoutines((data as RoutineRow[]).map(fromRow)) }
  return {
    async getAll(userId) {
      // A single JSON result keeps definitions consistent and avoids truncating nested steps at the REST row limit.
      const { data, error } = await client().rpc('xensi_get_training_routines')
      if (Array.isArray(data) && data.some((row: RoutineRow) => row.user_id !== userId)) throw new Error('Session changed')
      return rows(data, error)
    },
    async save(routine, createNew, userId) {
      const { data, error } = await client().rpc('xensi_save_training_routine', { definition: toDefinition(routine), create_new: createNew, expected_user_id: userId })
      const saved = rows(data, error).find(item => item.id === routine.id)
      if (!saved) throw new Error('Save not confirmed')
      return saved
    },
    async remove(id, userId) {
      const { data, error } = await client().from('training_routines').delete().eq('id', id).eq('user_id', userId).select('id')
      if (error || data?.length !== 1) throw new Error('Delete not confirmed')
    },
    async importRoutines(items, userId) {
      const { data, error } = await client().rpc('xensi_import_training_routines', { definitions: items.map(toDefinition), expected_user_id: userId })
      return rows(data, error)
    },
  }
}
export class RoutineRepository extends AccountCollectionRepository<CustomRoutine> {
  constructor(storage: Storage, private cloud: RoutineCloud, offerStorage?: Storage) {
    super(storage, { namespace: 'xensi-routines', readGuest: () => readGuestRoutines(storage), readCache: id => readRoutineCache(storage, id),
      writeCache: (id, items) => storage.setItem(routineCacheKey(id), JSON.stringify(items)), pendingGuest: id => pendingGuestRoutines(storage, id),
      markImported: (id, items) => markGuestRoutinesImported(storage, id, items), fetch: id => cloud.getAll(id), import: (items, id) => cloud.importRoutines(items, id) }, offerStorage)
  }
  getSnapshot = this.getCollectionSnapshot
  create(routine: CustomRoutine) { return this.save(routine, true) }
  update(routine: CustomRoutine) { return this.save(routine, false) }
  private save(routine: CustomRoutine, createNew: boolean, duplicateSource?: CustomRoutine) {
    return this.mutation(async userId => {
      const previous = this.getById(routine.id)
      const reference = previous ?? duplicateSource
      const issues = validateRoutine(routine).filter(issue => issue !== 'mode' || !reference || routine.items.some(item => !isRoutineModeAvailable(item.modeId)
        && !reference.items.some(old => old.modeId === item.modeId && (!previous || old.id === item.id))))
      const steps = [...routine.items].sort((a, b) => a.order - b.order)
      if (issues.length || !isUUID(routine.id) || !routine.name.trim() || routine.name.trim().length > 48 || !(routine.gameId in GAME_SENSITIVITY_PROFILE_BY_ID)
        || (createNew ? !!previous : !previous) || new Set(steps.map(item => item.id)).size !== steps.length
        || steps.some((item, index) => !isUUID(item.id) || item.order !== index || this.getAll().some(other => other.id !== routine.id && other.items.some(existing => existing.id === item.id)))) throw new Error('Invalid routine')
      const now = new Date().toISOString()
      const saved = userId ? await this.cloud.save(routine, createNew, userId) : normalizeRoutine({ ...routine, createdAt: previous?.createdAt ?? now, updatedAt: now })
      const items = sortRoutines([saved, ...this.getAll().filter(item => item.id !== saved.id)])
      if (!userId) writeGuestRoutines(this.storage, items)
      return items
    })
  }
  remove(id: string) {
    return this.mutation(async userId => {
      if (!this.getById(id)) throw new Error('Routine not found')
      if (userId) await this.cloud.remove(id, userId)
      const items = this.getAll().filter(item => item.id !== id)
      if (!userId) writeGuestRoutines(this.storage, items)
      return items
    })
  }
  rename(id: string, name: string) { const item = this.getById(id); return item ? this.update({ ...item, name }) : Promise.resolve(false) }
  duplicate(id: string, suffix: string) {
    const item = this.getById(id)
    const timestamp = new Date().toISOString()
    return item ? this.save({ ...item, id: createRoutineId(), name: `${item.name}${suffix}`.slice(0, 48), createdAt: timestamp, updatedAt: timestamp,
      items: item.items.map(step => ({ ...step, id: createRoutineId() })) }, true, item) : Promise.resolve(false)
  }
  reorder(id: string, stepIds: string[]) {
    const item = this.getById(id)
    if (!item || new Set(stepIds).size !== item.items.length || stepIds.length !== item.items.length || stepIds.some(key => !item.items.some(step => step.id === key))) return Promise.resolve(false)
    return this.update({ ...item, items: stepIds.map((key, order) => ({ ...item.items.find(step => step.id === key)!, order })) })
  }
  importGuestRoutines() { return this.importGuestData() }
}
let repository: RoutineRepository | undefined
export function getRoutineRepository() {
  if (!repository) {
    repository = new RoutineRepository(localStorage, createRoutineCloud(getSupabaseClient), sessionStorage)
    bindAccountCollection(repository, { guest: [ROUTINE_LIBRARY_STORAGE_KEY, CUSTOM_ROUTINE_STORAGE_KEY], cache: routineCacheKey, receipt: routineReceiptKey, guestEvent: 'xensi-routines-updated' })
  }
  return repository
}

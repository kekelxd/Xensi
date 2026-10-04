import type { GameSensitivityProfileId } from './gameSensitivityProfiles'
import type { WarmupDifficulty, WarmupExercise } from './warmupConfig'

export const CUSTOM_ROUTINE_STORAGE_KEY = 'xensi-custom-routine:v1'
export const ROUTINE_LIBRARY_STORAGE_KEY = 'xensi-routine-library:v1'
export const ROUTINE_ITEM_DURATIONS = [60, 120, 180, 240, 300] as const
export const ROUTINE_MAX_ITEM_SECONDS = 300
export const ROUTINE_MIN_ITEM_SECONDS = 60

export type RoutineItemDuration = typeof ROUTINE_ITEM_DURATIONS[number]

export type CustomRoutineItem = {
  id: string
  modeId: WarmupExercise
  durationSeconds: RoutineItemDuration
  difficulty: WarmupDifficulty
  order: number
}

export type CustomRoutine = {
  id: string
  name: string
  gameId: GameSensitivityProfileId
  presetId?: string
  items: CustomRoutineItem[]
  createdAt: string
  updatedAt: string
}

export type RoutineValidationIssue =
  | 'name'
  | 'empty'
  | 'mode'
  | 'duration'
  | 'difficulty'

import { EXERCISES, supportsExerciseDifficulty } from './warmupExercises'
const VALID_MODES = new Set<WarmupExercise>(EXERCISES.map(exercise => exercise.id))
const VALID_DIFFICULTIES = new Set<WarmupDifficulty>(['easy', 'medium', 'hard', 'adaptive'])

const now = () => new Date().toISOString()
export const createRoutineId = () => crypto.randomUUID()
export const isRoutineModeAvailable = (modeId: string) => VALID_MODES.has(modeId as WarmupExercise)

export function isRoutineDurationSeconds(value: unknown): value is RoutineItemDuration {
  return typeof value === 'number' && ROUTINE_ITEM_DURATIONS.includes(value as RoutineItemDuration)
}

export function supportsRoutineDifficulty(modeId: WarmupExercise, difficulty: WarmupDifficulty) {
  return VALID_DIFFICULTIES.has(difficulty) && supportsExerciseDifficulty(modeId, difficulty)
}

export function createRoutineItem(modeId: WarmupExercise, order = 0): CustomRoutineItem {
  return {
    id: createRoutineId(),
    modeId,
    durationSeconds: 60,
    difficulty: modeId === 'sniper-reaction' ? 'medium' : 'medium',
    order,
  }
}

export function getRoutineTotalSeconds(items: Pick<CustomRoutineItem, 'durationSeconds'>[]) {
  return items.reduce((total, item) => total + item.durationSeconds, 0)
}

export function formatRoutineDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes} min`
}

function normalizeRoutineItem(value: unknown, index: number): CustomRoutineItem | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<CustomRoutineItem>
  if (typeof candidate.modeId !== 'string' || !candidate.modeId.trim()) return null
  const difficulty = candidate.difficulty && supportsRoutineDifficulty(candidate.modeId, candidate.difficulty)
    ? candidate.difficulty
    : 'medium'
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createRoutineId(),
    modeId: candidate.modeId,
    durationSeconds: isRoutineDurationSeconds(candidate.durationSeconds) ? candidate.durationSeconds : 60,
    difficulty,
    order: Number.isFinite(candidate.order) ? Number(candidate.order) : index,
  }
}

export function createDefaultRoutine(gameId: GameSensitivityProfileId = 'cs2', presetId?: string): CustomRoutine {
  const timestamp = now()
  return {
    id: createRoutineId(),
    name: 'Warmup competitivo',
    gameId,
    ...(presetId ? { presetId } : {}),
    items: [
      { ...createRoutineItem('flick', 0), durationSeconds: 120 },
      { ...createRoutineItem('tracking', 1), durationSeconds: 180 },
      { ...createRoutineItem('sniper-reaction', 2), durationSeconds: 60 },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function normalizeRoutine(value: unknown, fallbackGameId: GameSensitivityProfileId = 'cs2'): CustomRoutine {
  if (!value || typeof value !== 'object') return createDefaultRoutine(fallbackGameId)
  const candidate = value as Partial<CustomRoutine>
  const timestamp = now()
  const items = Array.isArray(candidate.items)
    ? candidate.items.map(normalizeRoutineItem).filter((item): item is CustomRoutineItem => item !== null)
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({ ...item, order: index }))
    : []
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createRoutineId(),
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim().slice(0, 48) : 'Minha rotina',
    gameId: candidate.gameId ?? fallbackGameId,
    ...(typeof candidate.presetId === 'string' && candidate.presetId ? { presetId: candidate.presetId } : {}),
    items,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : timestamp,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : timestamp,
  }
}

export function validateRoutine(routine: CustomRoutine): RoutineValidationIssue[] {
  const issues: RoutineValidationIssue[] = []
  if (!routine.name.trim()) issues.push('name')
  if (!routine.items.length) issues.push('empty')
  for (const item of routine.items) {
    if (!VALID_MODES.has(item.modeId)) issues.push('mode')
    if (!isRoutineDurationSeconds(item.durationSeconds)) issues.push('duration')
    if (!supportsRoutineDifficulty(item.modeId, item.difficulty)) issues.push('difficulty')
  }
  return Array.from(new Set(issues))
}

export function readCustomRoutine(storage: Pick<Storage, 'getItem'>, fallbackGameId: GameSensitivityProfileId = 'cs2') {
  try {
    const raw = storage.getItem(CUSTOM_ROUTINE_STORAGE_KEY)
    return raw ? normalizeRoutine(JSON.parse(raw), fallbackGameId) : createDefaultRoutine(fallbackGameId)
  } catch {
    return createDefaultRoutine(fallbackGameId)
  }
}

export function writeCustomRoutine(storage: Pick<Storage, 'setItem'>, routine: CustomRoutine) {
  const next = normalizeRoutine({ ...routine, updatedAt: now() }, routine.gameId)
  storage.setItem(CUSTOM_ROUTINE_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function readRoutineLibrary(storage: Pick<Storage, 'getItem'>, fallbackGameId: GameSensitivityProfileId = 'cs2') {
  const seen = new Set<string>()
  const normalizeList = (values: unknown[]) => values
    .map((value) => normalizeRoutine(value, fallbackGameId))
    .filter((routine) => {
      if (seen.has(routine.id)) return false
      seen.add(routine.id)
      return true
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  try {
    const raw = storage.getItem(ROUTINE_LIBRARY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? normalizeList(parsed) : []
    }
  } catch {
    return []
  }

  try {
    const legacyRaw = storage.getItem(CUSTOM_ROUTINE_STORAGE_KEY)
    if (!legacyRaw) return []
    const legacy = normalizeRoutine(JSON.parse(legacyRaw), fallbackGameId)
    return legacy.items.length ? [legacy] : []
  } catch {
    return []
  }
}

export function writeRoutineLibrary(storage: Pick<Storage, 'setItem'>, routines: CustomRoutine[]) {
  const normalized = routines
    .map((routine) => normalizeRoutine(routine, routine.gameId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  storage.setItem(ROUTINE_LIBRARY_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function saveRoutineToLibrary(storage: Pick<Storage, 'getItem' | 'setItem'>, routine: CustomRoutine) {
  const saved = writeCustomRoutine(storage, routine)
  const library = readRoutineLibrary(storage, saved.gameId)
  const next = [saved, ...library.filter((item) => item.id !== saved.id)]
  writeRoutineLibrary(storage, next)
  return saved
}

export function deleteRoutineFromLibrary(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string) {
  const next = readRoutineLibrary(storage).filter((routine) => routine.id !== id)
  writeRoutineLibrary(storage, next)
  return next
}

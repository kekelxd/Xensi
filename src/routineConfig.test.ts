import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultRoutine,
  createRoutineItem,
  formatRoutineDuration,
  getRoutineTotalSeconds,
  isRoutineDurationSeconds,
  normalizeRoutine,
  readRoutineLibrary,
  readCustomRoutine,
  ROUTINE_ITEM_DURATIONS,
  ROUTINE_LIBRARY_STORAGE_KEY,
  saveRoutineToLibrary,
  supportsRoutineDifficulty,
  validateRoutine,
  writeCustomRoutine,
} from './routineConfig'
import { WARMUP_DURATION } from './warmupConfig'

describe('custom routine config', () => {
  it('keeps individual warmups at one minute and allows routine items from one to five minutes', () => {
    expect(WARMUP_DURATION).toBe(60)
    expect(ROUTINE_ITEM_DURATIONS).toEqual([60, 120, 180, 240, 300])
    expect(isRoutineDurationSeconds(60)).toBe(true)
    expect(isRoutineDurationSeconds(300)).toBe(true)
    expect(isRoutineDurationSeconds(301)).toBe(false)
    expect(isRoutineDurationSeconds(600)).toBe(false)
  })

  it('creates, totals and validates a playlist with repeated minigames', () => {
    const first = { ...createRoutineItem('flick', 0), durationSeconds: 120 as const, difficulty: 'medium' as const }
    const repeated = { ...createRoutineItem('flick', 1), durationSeconds: 300 as const, difficulty: 'hard' as const }
    const tracking = { ...createRoutineItem('tracking', 2), durationSeconds: 60 as const, difficulty: 'adaptive' as const }
    const routine = { ...createDefaultRoutine('cs2'), name: 'Aim day', items: [first, repeated, tracking] }

    expect(getRoutineTotalSeconds(routine.items)).toBe(480)
    expect(formatRoutineDuration(480)).toBe('8 min')
    expect(validateRoutine(routine)).toEqual([])
  })

  it('normalizes invalid stored values without accepting unsupported durations or difficulties', () => {
    const routine = normalizeRoutine({
      id: 'saved',
      name: '',
      gameId: 'valorant',
      items: [
        { id: 'b', modeId: 'tracking', durationSeconds: 999, difficulty: 'adaptive', order: 1 },
        { id: 'a', modeId: 'sniper-reaction', durationSeconds: 300, difficulty: 'adaptive', order: 0 },
        { id: 'bad', modeId: 'unknown', durationSeconds: 60, difficulty: 'medium', order: 2 },
      ],
    })

    expect(routine.name).toBe('Minha rotina')
    expect(routine.gameId).toBe('valorant')
    expect(routine.items.map((item) => item.id)).toEqual(['a', 'b', 'bad'])
    expect(validateRoutine(routine)).toContain('mode')
    expect(routine.items[0]).toMatchObject({ modeId: 'sniper-reaction', durationSeconds: 300, difficulty: 'medium', order: 0 })
    expect(routine.items[1]).toMatchObject({ modeId: 'tracking', durationSeconds: 60, difficulty: 'adaptive', order: 1 })
    expect(supportsRoutineDifficulty('sniper-reaction', 'adaptive')).toBe(false)
  })

  it('persists and reloads the custom routine in local storage', () => {
    const storage = new Map<string, string>()
    const localStorageLike = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    }
    const routine = { ...createDefaultRoutine('cs2'), name: 'Warmup competitivo' }

    writeCustomRoutine(localStorageLike, routine)
    const loaded = readCustomRoutine(localStorageLike, 'valorant')

    expect(localStorageLike.setItem).toHaveBeenCalledOnce()
    expect(loaded.name).toBe('Warmup competitivo')
    expect(loaded.gameId).toBe('cs2')
    expect(loaded.items).toHaveLength(3)
  })

  it('persists a saved-routine library without changing the routine item model', () => {
    const storage = new Map<string, string>()
    const localStorageLike = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    }
    const routine = { ...createDefaultRoutine('cs2'), id: 'library-one', name: 'Library one' }

    saveRoutineToLibrary(localStorageLike, routine)
    const library = readRoutineLibrary(localStorageLike)

    expect(JSON.parse(storage.get(ROUTINE_LIBRARY_STORAGE_KEY)!)).toHaveLength(1)
    expect(library[0]).toMatchObject({ id: 'library-one', name: 'Library one', gameId: 'cs2' })
    expect(library[0].items[0]).toHaveProperty('durationSeconds')
    expect(library[0].items[0]).toHaveProperty('difficulty')
  })

  it('blocks empty routines', () => {
    const routine = { ...createDefaultRoutine('cs2'), items: [] }
    expect(validateRoutine(routine)).toContain('empty')
  })
})

import { useSyncExternalStore } from 'react'
import { getRoutineRepository } from './routineRepository'
export function useRoutineState() {
  const repository = getRoutineRepository()
  return useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot)
}

import { useSyncExternalStore } from 'react'
import { derivePersonalBests, evaluatePersonalBest, getPersonalBestValue, personalBestKey, type PersonalBest } from './personalBests'
import { fetchPersonalBestSessions, type PersonalBestSource } from './personalBestCloud'
import { getSessionRepository, type SessionRepository } from './sessionRepository'
import type { TrainingSession } from './trainingSession'

type BestState = { userId: string | null; status: 'loading' | 'ready' | 'error'; items: PersonalBest[] }
type HistorySource = Pick<SessionRepository, 'getSnapshot' | 'subscribe' | 'waitForSession'> & {
  database: Pick<SessionRepository['database'], 'sessions'>
}

export class PersonalBestService {
  private state: BestState = { userId: null, status: 'loading', items: [] }
  private listeners = new Set<() => void>()
  private generation = 0
  private ownerGeneration = 0
  private authLoading = true
  private unsubscribe: () => void
  constructor(private history: HistorySource, private fetchBest: PersonalBestSource = fetchPersonalBestSessions) {
    const changed = () => {
      const source = history.getSnapshot()
      const authLoading = source.status === 'auth-loading'
      if (source.userId !== this.state.userId || authLoading !== this.authLoading) this.ownerGeneration++
      this.authLoading = authLoading
      this.generation++
      if (authLoading || source.userId !== this.state.userId) this.publish({ userId: source.userId, status: 'loading', items: [] })
      if (source.status === 'ready') void this.refresh()
      else this.publish({ ...this.state, status: 'loading' })
    }
    this.unsubscribe = history.subscribe(changed)
    changed()
  }
  dispose() { this.generation++; this.ownerGeneration++; this.unsubscribe(); this.listeners.clear() }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(state: BestState) { this.state = state; this.listeners.forEach(listener => listener()) }
  private assertOwner(owner: string | null, generation: number) {
    const source = this.history.getSnapshot()
    if (generation !== this.ownerGeneration || source.status === 'auth-loading' || source.userId !== owner) throw new Error('Account changed')
  }
  async refresh() {
    const source = this.history.getSnapshot(), generation = ++this.generation
    if (source.status === 'auth-loading') return
    const owner = source.userId
    this.publish({ userId: owner, status: 'loading', items: this.state.userId === owner ? this.state.items : [] })
    try {
      const rows = owner ? await this.fetchBest(owner) : await this.history.database.sessions(null)
      if (generation !== this.generation) return
      this.publish({ userId: owner, status: 'ready', items: derivePersonalBests(rows, owner) })
    } catch {
      if (generation === this.generation) this.publish({ userId: owner, status: 'error', items: [] })
    }
  }
  getAll() { return this.state.status === 'ready' ? this.state.items : [] }
  getForExercise(exerciseId: TrainingSession['exerciseId']) { return this.getAll().filter(best => best.exerciseId === exerciseId) }
  getForSession(session: TrainingSession) { return this.getAll().find(best => best.key === personalBestKey(session)) ?? null }
  async didSessionSetPB(session: TrainingSession) {
    const result = await this.compareSessionToPB(session)
    return !!result && result.status !== 'none'
  }
  async compareSessionToPB(session: TrainingSession) {
    if (getPersonalBestValue(session) === null) return null
    const owner = session.userId, generation = this.ownerGeneration
    this.assertOwner(owner, generation)
    await this.history.waitForSession(session)
    this.assertOwner(owner, generation)
    const prior = owner ? await this.fetchBest(owner, { exerciseId: session.exerciseId,
      comparisonSignature: session.comparisonSignature!, exerciseVersion: session.exerciseVersion, beforeSessionId: session.id })
      : await this.history.database.sessions(null)
    this.assertOwner(owner, generation)
    return evaluatePersonalBest(session, prior)
  }
}

let service: PersonalBestService | null = null
export function getPersonalBestService() { return service ??= new PersonalBestService(getSessionRepository()) }
export function usePersonalBests() {
  const source = getPersonalBestService()
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}

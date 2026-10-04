import { expect, type Page } from '@playwright/test'
import type { TrainingSession } from '../../src/trainingSession'
export async function readyHistory(page: Page) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/sessionRepository.ts')).getSessionRepository().getSnapshot().status)).toBe('ready')
}
export async function readSessions(page: Page, owner: string | null = null): Promise<TrainingSession[]> {
  return page.evaluate(async user => (await import('/src/sessionRepository.ts')).getSessionRepository().database.sessions(user), owner)
}
// Data fixtures exercise storage/transport separately from the real arena lifecycle tests.
export async function seedSession(page: Page, owner: string | null = null) {
  await readyHistory(page)
  const id = await page.evaluate(async userId => {
    const { getSessionRepository } = await import('/src/sessionRepository.ts')
    const { SessionRecorder } = await import('/src/sessionRecorder.ts')
    const { exerciseConfig } = await import('/src/trainingSession.ts')
    const { createEmptyWarmupMetrics } = await import('/src/warmupTelemetry.ts')
    const repository = getSessionRepository(), recorder = new SessionRecorder(repository, 'fixture')
    recorder.start(userId, 'flick', { gameId: 'cs2', sensitivity: .65, dpi: 800 }, exerciseConfig('flick', 'medium', 'medium', 60, 1440, 900, 'dot'))
    return recorder.complete({ ...createEmptyWarmupMetrics(60), score: 100, hits: 1, shots: 2, accuracy: 50, remaining: 0 })!.id
  }, owner)
  await expect.poll(async () => (await readSessions(page, owner)).some(s => s.id === id)).toBe(true)
  return id
}

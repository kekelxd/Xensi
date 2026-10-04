import { expect, test } from '@playwright/test'
import { readSessions, readyHistory } from './fixtures/sessionHistory'
test.describe('Sessions storage edge cases', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); await readyHistory(page) })
  test('does not recover a parent recording when a new tab clones sessionStorage', async ({ page, context }) => {
    const original = await page.evaluate(async () => {
      const { getSessionRepository, sessionTabId } = await import('/src/sessionRepository.ts')
      const { SessionRecorder } = await import('/src/sessionRecorder.ts')
      const { exerciseConfig } = await import('/src/trainingSession.ts')
      const recorder = new SessionRecorder(getSessionRepository(), sessionTabId())
      recorder.start(null, 'flick', { gameId: 'cs2', sensitivity: 1, dpi: 800 }, exerciseConfig('flick', 'easy', 'easy', 60, 1000, 600, 'dot'))
      return sessionTabId()
    })
    const tab = await context.newPage()
    await tab.addInitScript(id => sessionStorage.setItem('xensi-session-tab', id), original)
    await tab.goto('/'); await readyHistory(tab)
    const duplicate = await tab.evaluate(async () => (await import('/src/sessionRepository.ts')).sessionTabId())
    expect(duplicate).not.toBe(original); expect(await readSessions(tab)).toEqual([])
    await tab.close()
  })
  test('reports an unavailable IndexedDB without pretending to save in memory', async ({ page }) => {
    const failed = await page.evaluate(async () => {
      const { IndexedSessionStorage } = await import('/src/sessionStorage.ts')
      const storage = new IndexedSessionStorage(undefined, localStorage)
      try { await storage.sessions(null); return false } catch { return true }
    })
    expect(failed).toBe(true)
  })
})

import { expect, test, type Page } from '@playwright/test'
import { readSessions, readyHistory } from './fixtures/sessionHistory'

async function start(page: Page, label: string) {
  await readyHistory(page)
  await page.locator('.warmup-exercises').getByRole('button', { name: label }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.clock.install()
  await page.getByRole('button', { name: /Iniciar aquecimento/ }).click()
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await page.clock.runFor(3500)
}
const modes = [ ['switch', 'Target Switch'], ['tracking', 'Tracking'], ['flick', 'Target Shooting'], ['reflex', 'Reflex'], ['gridshot', 'Gridshot'], ['strafetrack', 'Strafetrack'], ['sniper-reaction', 'Sniper Reaction'] ]
test.describe('Real Sessions V1 arena lifecycle', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Real mouse pointer-lock runs are desktop-only.')
    await page.addInitScript(() => { localStorage.setItem('sensi-locale', 'pt'); Math.random = () => .5 })
    await page.goto('/'); await page.getByRole('button', { name: 'Começar agora' }).first().click()
  })
  for (const [exercise, label] of modes) test(`records a completed ${exercise} execution in IndexedDB`, async ({ page }, info) => {
    test.setTimeout(90000)
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await start(page, label)
    await page.mouse.click(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2)
    await page.clock.runFor(61000)
    await expect(page.locator('.warmup-result-modal')).toBeVisible()
    await expect.poll(async () => (await readSessions(page)).length).toBe(1)
    const record = (await readSessions(page))[0]
    expect(record).toMatchObject({ exerciseId: exercise, status: 'completed', invalidReason: null, schemaVersion: 1, exerciseVersion: 1 })
    expect(record.durationMs).toBeGreaterThanOrEqual(60000); expect(record.durationMs).toBeLessThan(60500)
    expect(record.config).toMatchObject({ durationSeconds: 60, input: 'mouse-pointer-lock' }); expect(record.comparisonSignature).toBeTruthy()
    expect(record.metrics).not.toBeNull(); expect(errors).toEqual([])
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sensi-warmup-session')))).toEqual([])
    await page.screenshot({ path: info.outputPath(`${exercise}-session-result.png`) })
    await page.clock.resume(); await page.reload(); await readyHistory(page)
    expect((await readSessions(page))[0].id).toBe(record.id)
  })
  test('ESC, pointer-lock loss and manual exit retain an interrupted record without PB', async ({ page }) => {
    await start(page, 'Target Switch'); await page.clock.runFor(1000)
    await page.keyboard.press('Escape'); await page.evaluate(async () => { document.exitPointerLock(); if (document.fullscreenElement) await document.exitFullscreen() })
    await page.getByRole('button', { name: 'INÍCIO', exact: true }).click()
    await expect.poll(async () => (await readSessions(page)).length).toBe(1)
    expect((await readSessions(page))[0]).toMatchObject({ status: 'interrupted', invalidReason: 'escape' })
    await expect(page.locator('.personal-best-feedback')).toHaveCount(0)
  })
  test('reload during gameplay recovers the same UUID as interrupted instead of completed', async ({ page }) => {
    await start(page, 'Target Switch'); await page.clock.runFor(1000)
    const id = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('xensi-sessions-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      return new Promise<string>((resolve, reject) => { const request = db.transaction('documents').objectStore('documents').getAll(); request.onsuccess = () => { resolve(request.result.find(r => r.kind === 'active' && r.value.kind === 'session').value.value.id); db.close() }; request.onerror = () => reject(request.error) })
    })
    await page.clock.resume(); await page.reload(); await readyHistory(page)
    await expect.poll(async () => (await readSessions(page)).length).toBe(1)
    expect((await readSessions(page))[0]).toMatchObject({ id, status: 'interrupted', invalidReason: 'page_reload' })
  })
  test('pointer-lock loss without ESC retains its own invalidation reason', async ({ page }) => {
    await start(page, 'Target Switch')
    await page.evaluate(async () => { document.exitPointerLock(); if (document.fullscreenElement) await document.exitFullscreen() })
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
    await page.getByRole('button', { name: 'INÍCIO', exact: true }).click()
    await expect.poll(async () => (await readSessions(page)).length).toBe(1)
    expect((await readSessions(page))[0]).toMatchObject({ status: 'interrupted', invalidReason: 'pointer_lock_lost' })
  })
  test('a simulated hidden-page event invalidates the active execution', async ({ page }) => {
    await start(page, 'Target Switch')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(async () => { document.exitPointerLock(); if (document.fullscreenElement) await document.exitFullscreen() })
    await page.getByRole('button', { name: 'INÍCIO', exact: true }).click()
    await expect.poll(async () => (await readSessions(page)).length).toBe(1)
    expect((await readSessions(page))[0]).toMatchObject({ status: 'interrupted', invalidReason: 'visibility_hidden' })
  })
})

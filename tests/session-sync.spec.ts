import { expect, test, type Page } from '@playwright/test'
import { login, mockCloud, seedGuest, userA, userB } from './fixtures/accountCloud'
import { readSessions, readyHistory, seedSession } from './fixtures/sessionHistory'

async function logout(page: Page) { await page.locator('.xensi-user-trigger').click(); await page.getByRole('button', { name: 'Sair', exact: true }).click() }
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; errors.set(page, messages)
  page.on('pageerror', error => messages.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) messages.push(message.text()) })
  await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0) })

test.describe('Sessions V1 account transport and consent', () => {
  test('records a real execution while authenticated history is still loading', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'Mouse pointer-lock requires desktop.')
    const cloud = await mockCloud(context)
    await login(page); await readyHistory(page)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/rest/v1/training_sessions?**', async route => { await gate; await route.fallback() })
    try {
      await page.evaluate(async () => { void (await import('/src/sessionRepository.ts')).getSessionRepository().refresh() })
      await expect.poll(() => page.evaluate(async () => (await import('/src/sessionRepository.ts')).getSessionRepository().getSnapshot().status)).toBe('data-loading')
      await page.getByRole('button', { name: 'Começar agora' }).first().click()
      await page.locator('.warmup-exercises').getByRole('button', { name: 'Target Switch' }).click()
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.clock.install()
      await page.getByRole('button', { name: /Iniciar aquecimento/ }).click()
      await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
      await page.clock.runFor(4500)
      await page.evaluate(async () => { document.exitPointerLock(); if (document.fullscreenElement) await document.exitFullscreen() })
      await page.getByRole('button', { name: 'INÍCIO', exact: true }).click()
      await expect.poll(async () => (await readSessions(page, userA)).length).toBe(1)
      expect((await readSessions(page, userA))[0]).toMatchObject({ userId: userA, status: 'interrupted' })
    } finally { release() }
    await readyHistory(page)
    await expect.poll(() => cloud.sessions.length).toBe(1)
  })
  test('imports sparse legacy evidence as invalid, without inventing V1 metrics or configuration', async ({ page, context }) => {
    const cloud = await mockCloud(context)
    await page.addInitScript(() => localStorage.setItem('sensi-warmup-session:v1:flick', JSON.stringify({ completedAt: '2026-09-25T12:00:00.000Z', score: 200, accuracy: 50 })))
    await login(page)
    const dialog = page.getByRole('dialog', { name: 'Importar histórico de visitante?' })
    await dialog.getByRole('button', { name: 'Importar histórico' }).click(); await expect(dialog).not.toBeVisible()
    expect(cloud.sessions).toHaveLength(1)
    expect(cloud.sessions[0]).toMatchObject({ status: 'invalid', invalid_reason: 'legacy_unverified', duration_ms: 0, configuration: null, context: null, comparison_signature: null, metrics: { score: 200, accuracy: 50 } })
    expect(await readSessions(page)).toHaveLength(1)
  })
  test('imports all three collections with one confirmation and retains guest UUIDs across reload', async ({ page, context }, info) => {
    const cloud = await mockCloud(context); await page.goto('/'); await seedGuest(page)
    await page.evaluate(() => localStorage.setItem('xensi-routine-library:v1', JSON.stringify([{
      id: crypto.randomUUID(), name: 'Guest routine', gameId: 'cs2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [{ id: crypto.randomUUID(), modeId: 'flick', durationSeconds: 60, difficulty: 'medium', order: 0 }],
    }])))
    const id = await seedSession(page)
    await login(page)
    const dialog = page.getByRole('dialog', { name: 'Dados encontrados neste dispositivo' })
    await expect(dialog).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(dialog).toContainText('1 presets, 1 rotinas e 1 sessões.')
    expect(cloud.sessions).toHaveLength(0)
    const bounds = await dialog.boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width); expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.screenshot({ path: info.outputPath('sessions-combined-import.png') })
    await dialog.getByRole('button', { name: 'IMPORTAR', exact: true }).click()
    await expect.poll(() => cloud.sessions.map(s => s.id)).toEqual([id]); await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(cloud.rows).toHaveLength(1); expect(cloud.routineRows).toHaveLength(1)
    expect((await readSessions(page)).map(s => s.id)).toEqual([id])
    await page.reload(); await readyHistory(page); await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readSessions(page, userA)).map(s => s.id)).toEqual([id])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
  test('dismisses history import, preserves originals, and retries a committed import with a lost response', async ({ page, context }) => {
    const cloud = await mockCloud(context); await page.goto('/'); const id = await seedSession(page)
    await login(page); const dialog = page.getByRole('dialog', { name: 'Importar histórico de visitante?' })
    await dialog.getByRole('button', { name: 'AGORA NÃO' }).click(); await page.reload(); await readyHistory(page)
    await expect(page.getByRole('dialog')).toHaveCount(0); expect(cloud.sessions).toHaveLength(0)
    await page.locator('.xensi-user-trigger').click()
    await page.getByRole('button', { name: 'Meu perfil', exact: true }).click()
    await page.getByRole('button', { name: 'Dados encontrados neste dispositivo', exact: true }).click()
    cloud.loseHistoryResponse = true
    await dialog.getByRole('button', { name: 'Importar histórico', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar')
    expect(cloud.sessions).toHaveLength(1)
    expect(await page.evaluate(async owner => (await import('/src/sessionRepository.ts')).getSessionRepository().database.pendingGuest(owner).then(s => s.length), userA)).toBe(1)
    await dialog.getByRole('button', { name: 'Importar histórico', exact: true }).click(); await expect(dialog).not.toBeVisible()
    expect(cloud.sessions.map(s => s.id)).toEqual([id]); expect(await readSessions(page)).toHaveLength(1)
  })
  test('keeps pending account A uploads through logout and never sends them as B', async ({ page, context }) => {
    const cloud = await mockCloud(context); await login(page); await expect(page.locator('.xensi-user-trigger')).toBeVisible(); await readyHistory(page)
    cloud.failWrites = true; const id = await seedSession(page, userA)
    await expect(page.getByRole('alert')).toContainText('envios pendentes')
    await logout(page); await readyHistory(page); expect(await readSessions(page)).toEqual([])
    cloud.failWrites = false; await login(page, 'b@example.invalid'); await readyHistory(page)
    expect(await readSessions(page, userB)).toEqual([]); expect(cloud.sessions).toHaveLength(0)
    expect(await page.evaluate(async owner => (await import('/src/sessionRepository.ts')).getSessionRepository().database.pending(owner).then(s => s.length), userA)).toBe(1)
    await logout(page); await login(page); await readyHistory(page)
    await expect.poll(() => cloud.sessions.length).toBe(1)
    expect(cloud.sessions[0]).toMatchObject({ id, user_id: userA })
    expect(cloud.historyCalls.every(call => call.payload.sessions.every(s => s.user_id === call.owner))).toBe(true)
    expect(await readSessions(page, userA)).toHaveLength(1)
  })
  test('retries a response-lost append once per UUID and loads the same history in a second browser', async ({ page, context, browser }) => {
    const cloud = await mockCloud(context); await login(page); await expect(page.locator('.xensi-user-trigger')).toBeVisible(); await readyHistory(page)
    cloud.loseHistoryResponse = true; const id = await seedSession(page, userA)
    await expect(page.getByRole('alert')).toContainText('sincronizar o histórico')
    await page.getByRole('alert').getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0); expect(cloud.sessions.map(s => s.id)).toEqual([id])
    const second = await browser.newContext({ viewport: page.viewportSize()!, locale: 'pt-BR', baseURL: 'http://127.0.0.1:5175/' })
    try {
      const other = await mockCloud(second); other.sessions = cloud.sessions
      const tab = await second.newPage(); await tab.goto('http://127.0.0.1:5175/login'); await login(tab); await readyHistory(tab)
      expect((await readSessions(tab, userA)).map(s => s.id)).toEqual([id])
    } finally { await second.close() }
  })
})

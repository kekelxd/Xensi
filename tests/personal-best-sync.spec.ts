import { expect, test } from '@playwright/test'
import { login, mockCloud, userA, userB } from './fixtures/accountCloud'
import { readyHistory, readSessions } from './fixtures/sessionHistory'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
})

test('loads Micro Flick account PB with acquisition quality gates and recomputes after deletion', async ({ page, context }) => {
  const cloud = await mockCloud(context)
  await page.goto('/')
  cloud.sessions = await page.evaluate(async owner => {
    const { makeSession } = await import('/src/testFixtures/sessions.ts')
    const { sessionRow } = await import('/src/sessionCloud.ts')
    return [310.4, 310.2, 100].map((value, i) => {
      const session = makeSession(value, i + 1, { userId: owner, exerciseId: 'micro_flick' })
      if (session.exerciseId === 'micro_flick' && session.status === 'completed' && i === 2) session.metrics.accuracy = 80
      return sessionRow(session)
    })
  }, userA)
  await login(page); await readyHistory(page)
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  const panel = page.getByRole('article', { name: 'Recordes pessoais' })
  await expect(panel).toContainText('Micro Flick')
  await expect(panel.locator('strong')).toHaveText('310 ms')
  await expect(panel.locator('[data-session-id="' + cloud.sessions[1].id + '"]')).toHaveCount(1)
  cloud.sessions.splice(1, 1)
  await panel.getByRole('button', { name: 'Atualizar recordes' }).click()
  await expect(panel.locator('[data-session-id="' + cloud.sessions[0].id + '"]')).toHaveCount(1)
})

test('loads an old lifetime record beyond the 300-row cache, handles deletion/errors and isolates accounts', async ({ page, context }) => {
  const cloud = await mockCloud(context)
  await page.goto('/')
  cloud.sessions = await page.evaluate(async owner => {
    const { makeSession } = await import('/src/testFixtures/sessions.ts')
    const { sessionRow } = await import('/src/sessionCloud.ts')
    return Array.from({ length: 351 }, (_, i) => sessionRow(makeSession(i === 0 ? 120 : 110, i + 1, { userId: owner })))
  }, userA)
  await login(page); await readyHistory(page)
  expect(await readSessions(page, userA)).toHaveLength(300)
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  const panel = page.getByRole('article', { name: 'Recordes pessoais' })
  await expect(panel.locator('strong')).toHaveText('120')
  expect(cloud.pbCalls).toBeGreaterThan(0)
  cloud.sessions.shift()
  await panel.getByRole('button', { name: 'Atualizar recordes' }).click()
  await expect(panel.locator('strong')).toHaveText('110')
  cloud.failPB = true
  await panel.getByRole('button', { name: 'Atualizar recordes' }).click()
  await expect(panel).toContainText('Recorde pessoal indisponível')
  await expect(panel.locator('strong')).toHaveCount(0)
  cloud.failPB = false
  await page.locator('.xensi-user-trigger').click()
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  await expect(panel).toContainText('Nenhum recorde registrado')
  await login(page, 'b@example.invalid'); await readyHistory(page)
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  await expect(panel).toContainText('Nenhum recorde registrado')
  expect(await readSessions(page, userB)).toEqual([])
})

test('derives imported guest sessions and refreshes a second device without separate PB writes', async ({ page, context, browser }) => {
  const cloud = await mockCloud(context)
  await page.goto('/'); await readyHistory(page)
  cloud.sessions = await page.evaluate(async owner => {
    const { makeSession } = await import('/src/testFixtures/sessions.ts')
    const { sessionRow } = await import('/src/sessionCloud.ts')
    const { getSessionRepository } = await import('/src/sessionRepository.ts')
    await getSessionRepository().database.save({ kind: 'session', value: makeSession(140, 3) }, false)
    return [sessionRow(makeSession(100, 1, { userId: owner })), sessionRow(makeSession(120, 2, { userId: owner }))]
  }, userA)
  await login(page)
  const dialog = page.getByRole('dialog', { name: 'Importar histórico de visitante?' })
  await dialog.getByRole('button', { name: 'Importar histórico', exact: true }).click()
  await expect(dialog).not.toBeVisible(); await readyHistory(page)
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  await expect(page.locator('.analysis-pb-panel strong')).toHaveText('140')
  expect(cloud.sessions).toHaveLength(3)
  const second = await browser.newContext({ viewport: page.viewportSize()!, baseURL: 'http://127.0.0.1:5175/' })
  try {
    const other = await mockCloud(second); other.sessions = cloud.sessions
    const tab = await second.newPage()
    await tab.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
    await login(tab); await readyHistory(tab)
    await tab.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
    await expect(tab.locator('.analysis-pb-panel strong')).toHaveText('140')
    other.sessions.splice(2, 1)
    await tab.getByRole('button', { name: 'Atualizar recordes' }).click()
    await expect(tab.locator('.analysis-pb-panel strong')).toHaveText('120')
  } finally { await second.close() }
})

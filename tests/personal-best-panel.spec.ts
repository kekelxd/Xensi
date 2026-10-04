import { expect, test } from '@playwright/test'
import { readyHistory } from './fixtures/sessionHistory'

test('shows persisted guest variants and raw-metric formatting without viewport overflow', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
  await page.goto('/'); await readyHistory(page)
  await page.evaluate(async () => {
    const { makeSession } = await import('/src/testFixtures/sessions.ts')
    const { getSessionRepository } = await import('/src/sessionRepository.ts')
    const { exerciseConfig } = await import('/src/trainingSession.ts')
    const rows = [makeSession(100, 1), makeSession(120, 2), makeSession(110, 3),
      makeSession(150, 4, { status: 'invalid', invalidReason: 'manual_abort' }),
      makeSession(90, 5, { exerciseVersion: 2 }),
      makeSession(200, 6, { config: exerciseConfig('flick', 'medium', 'medium', 30, 1440, 900, 'dot') }),
      makeSession(181.4, 7, { exerciseId: 'sniper-reaction' }), makeSession(181.2, 8, { exerciseId: 'sniper-reaction' }),
      makeSession(87.43, 9, { exerciseId: 'tracking' })]
    for (const value of rows) await getSessionRepository().database.save({ kind: 'session', value }, false)
  })
  await page.reload()
  await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  const panel = page.getByRole('article', { name: 'Recordes pessoais' })
  await expect(panel.locator('section')).toHaveCount(5)
  await expect(panel.getByText('181 ms', { exact: true })).toBeVisible()
  await expect(panel.getByText('87,4%', { exact: true })).toBeVisible()
  await expect(panel.getByText('120', { exact: true })).toBeVisible()
  await expect(panel.getByText('150', { exact: true })).toHaveCount(0)
  await expect(panel).toContainText('30s'); await expect(panel).toContainText('v2')
  await panel.locator('summary').first().click()
  await expect(panel.getByText('Mouse', { exact: true }).first()).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  const bounds = await panel.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('personal-bests-variants.png') })
})

test('shows a real localized empty state in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sensi-locale', 'en'))
  await page.goto('/')
  await page.getByRole('button', { name: 'ANALYSIS', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Personal bests' })).toContainText('No personal bests yet')
  await expect(page.locator('.analysis-pb-panel strong')).toHaveCount(0)
})

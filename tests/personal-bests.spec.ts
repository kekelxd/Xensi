import { expect, test } from '@playwright/test'

test.describe('Personal best feedback', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'The real pointer-lock session is covered on desktop.')
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('pb-test-initialized')) {
        localStorage.clear()
        sessionStorage.setItem('pb-test-initialized', 'true')
      }
      localStorage.setItem('sensi-locale', 'pt')
      Math.random = () => .5
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Começar agora' }).first().click()
  })

  test('establishes, improves and preserves a record across real sessions', async ({ page }) => {
    test.setTimeout(90000)
    await page.getByRole('button', { name: /Target Switch/ }).click()
    await page.getByRole('button', { name: /Continuar/ }).click()
    await page.getByRole('button', { name: /Continuar/ }).click()
    await page.clock.install()
    await page.getByRole('button', { name: /Iniciar aquecimento/ }).click()
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
    await page.clock.runFor(3500)
    const centerAim = async () => page.evaluate(() => {
      const canvas = document.querySelector('canvas.warmup-arena')
      if (!canvas) throw new Error('Warm-up canvas not found')
      const move = (movementX: number, movementY: number) => document.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }))
      move(-100000, -100000)
      move(canvas.clientWidth / 2 - 18, canvas.clientHeight / 2 - 18)
    })
    const leaveTarget = async () => page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: -100000, movementY: 0 })))

    await centerAim()
    await page.clock.runFor(8000)
    await leaveTarget()
    await page.clock.runFor(52000)
    await expect(page.locator('.warmup-result-modal')).toBeVisible()
    await expect(page.locator('.personal-best-feedback')).toContainText('PRIMEIRO RECORDE')
    await expect(page.locator('.personal-best-feedback')).toContainText('Score')

    const saved = await page.evaluate(async () => (await import('/src/sessionRepository.ts')).getSessionRepository().database.sessions(null))
    expect(saved).toHaveLength(1)
    expect(saved[0].config).toMatchObject({ effectiveDifficulty: 'easy', durationSeconds: 60 })

    await page.locator('.warmup-result-modal').getByRole('button', { name: 'Repetir' }).click()
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
    await page.clock.runFor(3500)
    await centerAim()
    await page.clock.runFor(61000)
    await expect(page.locator('.personal-best-new')).toContainText('NOVO RECORDE')
    await expect(page.locator('.personal-best-new')).toContainText('Recorde anterior')
    await expect(page.locator('.personal-best-new')).toContainText('↑')

    await page.locator('.warmup-result-modal').getByRole('button', { name: 'Repetir' }).click()
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
    await page.clock.runFor(3500)
    await centerAim()
    await page.clock.runFor(5000)
    await leaveTarget()
    await page.clock.runFor(55000)
    await expect(page.locator('.warmup-result-modal')).toBeVisible()
    await expect(page.locator('.personal-best-feedback')).toHaveCount(0)

    await page.reload()
    const persisted = await page.evaluate(async () => (await import('/src/sessionRepository.ts')).getSessionRepository().database.sessions(null))
    expect(persisted).toHaveLength(3)
  })
})

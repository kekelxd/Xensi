import { expect, test } from '@playwright/test'

test.describe('Sniper Reaction training', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('sensi-locale')) localStorage.setItem('sensi-locale', 'pt'); Math.random = () => .5 })
    await page.goto('./')
    await page.getByRole('button', { name: 'Começar agora' }).first().click()
  })

  test('previews on hover and focus without saving a session', async ({ page }, info) => {
    const card = page.getByRole('button', { name: /Sniper Reaction/ })
    await expect(card).toContainText('Teste sua reação')
    await expect(card).toContainText('Configurar')
    await card.hover()
    const preview = card.locator('.sniper-preview-opening > span')
    await expect(preview).toHaveCSS('animation-name', 'sniperPeek')
    const first = await preview.evaluate(el => getComputedStyle(el).transform)
    await expect.poll(() => preview.evaluate(el => getComputedStyle(el).transform)).not.toBe(first)
    await page.screenshot({ path: `test-results/sniper-preview-${info.project.name}.png` })
    await page.mouse.move(0, 0)
    await expect(preview).toHaveCount(0)
    await card.focus()
    await expect(preview).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(preview).toHaveCount(0)
    await page.getByRole('button', { name: /Gridshot/ }).hover()
    await expect(page.locator('.warmup-preview-gridshot')).toBeVisible()
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sensi-warmup-session')))).toEqual([])
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  })

  test('configures the mode and completes the supported desktop session', async ({ page, isMobile }, info) => {
    test.setTimeout(90000)
    await page.getByRole('button', { name: /Sniper Reaction/ }).click()
    await page.getByRole('button', { name: /Continuar/ }).click()
    await expect(page.getByRole('button', { name: /Adaptativa/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Continuar/ }).click()
    if (isMobile) {
      await expect(page.getByRole('button', { name: /Iniciar aquecimento/ })).toBeVisible()
      await page.screenshot({ path: 'test-results/sniper-mobile-setup.png' })
      return // Touch-only browsers do not provide the existing trainer's pointer-lock input.
    }
    await page.clock.install()
    await page.getByRole('button', { name: /Iniciar aquecimento/ }).click()
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
    await page.clock.runFor(3400)
    await page.mouse.down()
    await page.mouse.up()
    await page.clock.runFor(2800)
    await page.screenshot({ path: `test-results/sniper-arena-${info.project.name}.png` })
    await page.clock.runFor(60000)
    await expect(page.locator('.warmup-result-modal')).toBeVisible()
    await expect(page.locator('.warmup-result-modal')).toContainText('Antecipações')
    await expect(page.locator('.warmup-result-modal')).toContainText('Consistência')
    const saved = await page.evaluate(async () => (await (await import('/src/sessionRepository.ts')).getSessionRepository().database.sessions(null))[0])
    expect(saved.metrics.attempts).toBeGreaterThan(0)
    expect(saved.metrics.noShots).toBeGreaterThan(0)
    expect(saved.metrics.earlyShots).toBe(1)
    await page.screenshot({ path: `test-results/sniper-result-${info.project.name}.png` })
    await page.locator('.warmup-result-modal').getByRole('button', { name: /Sair/ }).click()
    await expect(page.locator('canvas.warmup-arena')).toHaveCount(0)
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true)
    await expect(page.getByRole('button', { name: /Sniper Reaction/ })).toBeVisible()
  })

  test('respects reduced motion and translates the new card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const card = page.getByRole('button', { name: /Sniper Reaction/ })
    await card.scrollIntoViewIfNeeded()
    await card.focus()
    await expect(card.locator('.sniper-preview-opening > span')).toHaveCSS('animation-name', 'none')
    for (const [locale, description, start] of [
      ['en', 'Test your reaction', 'Start now'],
      ['es', 'Pon a prueba tu reacción', 'Empezar ahora'],
    ]) {
      await page.evaluate(value => localStorage.setItem('sensi-locale', value), locale)
      await page.goto('./')
      const homeCta = page.getByRole('button', { name: start, exact: true }).first()
      await homeCta.click()
      await expect(page.getByRole('button', { name: /Sniper Reaction/ })).toContainText(description)
    }
  })
})

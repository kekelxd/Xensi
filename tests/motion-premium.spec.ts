import { expect, test } from '@playwright/test'

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`Premium motion: ${reducedMotion}`, () => {
    test.use({ reducedMotion })
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
      await page.goto('./')
    })

    test('keeps hero actions usable and the latest rapid navigation authoritative', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await expect(page.getByRole('heading', { name: 'Treine melhor. Jogue diferente.' })).toBeVisible()
      for (const target of ['.xensi-reference-copy h1', '.xensi-reference-copy p', '.xensi-home-v3-primary', '.xensi-home-v3-secondary']) {
        const bounds = await page.locator(target).evaluate(element => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, viewport: innerWidth }
        })
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport)
      }
      await page.getByRole('button', { name: 'Começar agora', exact: true }).evaluate(button => button.click())
      await expect(page.getByRole('heading', { name: 'Prepare a mira antes da partida' })).toBeVisible()
      await page.getByRole('button', { name: 'XENSI home' }).click()
      await expect(page.locator('.xensi-premium-home')).toBeVisible()
      for (let index = 0; index < 8; index++) {
        await page.getByRole('button', { name: index % 2 ? 'CONVERTER' : 'ANÁLISE', exact: true }).evaluate(button => button.click())
      }
      await expect(page).toHaveURL(/\/convert$/)
      await expect(page.locator('.converter-workspace')).toBeVisible()
      await expect(page.locator('.xensi-primary-nav .xensi-active-indicator')).toHaveCount(1)
      await page.goBack()
      await expect(page.locator('.analysis-workspace')).toBeVisible()
      expect(errors).toEqual([])
    })

    test('limits lighting to Home and preserves readable previews through interrupted filters', async ({ page, isMobile }) => {
      const card = page.locator('.xensi-home-v3-path-card').first()
      if (!isMobile && reducedMotion !== 'reduce') {
        await card.hover()
        await expect(card).toHaveAttribute('data-light-active', 'true')
        await expect(card.locator('.xensi-edge-light')).toHaveCSS('opacity', '1')
        await page.mouse.move(0, 0)
        await expect(card).toHaveAttribute('data-light-active', 'false')
        await expect(card.locator('.xensi-edge-light')).toHaveCSS('opacity', '0')
      } else {
        await card.getByRole('button', { name: 'Explorar treinos' }).focus()
        await expect(card.locator('.xensi-edge-light')).toHaveCSS('opacity', '1')
      }
      if (reducedMotion === 'reduce') {
        await expect(page.locator('.xensi-hero-light')).toHaveCSS('animation-name', 'none')
        await expect(page.locator('.xensi-technical-mask').first()).toHaveCSS('transform', 'none')
      }
      await card.getByRole('button', { name: 'Explorar treinos' }).click()
      const filters = page.getByRole('group', { name: 'Filtrar por habilidade' })
      for (let index = 0; index < 8; index++) {
        await filters.getByRole('button').nth(index % 5).evaluate(button => button.click())
      }
      await filters.getByRole('button', { name: /Todos/ }).click()
      await expect(page.locator('.warmup-exercises > button')).toHaveCount(9)
      await expect(filters.locator('.xensi-active-indicator')).toHaveCount(1)
      const exercise = page.getByRole('button', { name: /Target Switch/ }).first()
      await exercise.focus()
      await expect(exercise.locator('.warmup-preview')).toBeVisible()
      await expect(exercise.locator(':scope > strong')).toHaveText('Target Switch')
      await expect(exercise.locator(':scope > strong')).toBeVisible()
      await expect(exercise.getByText('Configurar treino', { exact: true })).toBeVisible()
      expect(await page.locator('[data-light-surface]').count()).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}

test('fallback navigation completes when a route is selected again during its animation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sensi-locale', 'pt')
    Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true })
  })
  await page.goto('./')
  const analysis = page.getByRole('button', { name: 'ANÁLISE', exact: true })
  await analysis.click()
  await expect(page.locator('.analysis-workspace')).toBeVisible()
  await analysis.evaluate(button => button.click())
  await expect(page.locator('.analysis-workspace')).toHaveCSS('opacity', '1')
})

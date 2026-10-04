import { expect, test } from '@playwright/test'

test.describe('Training catalog categories', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('sensi-locale')) localStorage.setItem('sensi-locale', 'pt') })
    await page.goto('./')
  })

  test('filters registry modes and cleans up previews without changing card size', async ({ page }, info) => {
    await page.locator('.xensi-reference-hero').getByRole('button', { name: 'Começar agora', exact: true }).click()
    await expect(page.getByText('Aquecimento FPS', { exact: true })).toHaveCount(0)
    const filters = page.getByRole('group', { name: 'Filtrar por habilidade' })
    const cards = page.locator('.warmup-exercises > button')
    await expect(cards).toHaveCount(8)
    for (const [filter, names] of [
      ['Precisão', ['Target Switch', 'Target Shooting', 'Micro Flick', 'Gridshot']],
      ['Tracking', ['Tracking', 'Strafetrack']],
      ['Reação', ['Reflex', 'Sniper Reaction']],
    ] as const) {
      const button = filters.getByRole('button', { name: new RegExp(filter) })
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(cards.locator(':scope > strong')).toHaveText([...names])
      for (const name of names) {
        const card = cards.filter({ has: page.locator('strong', { hasText: name }) })
        const before = await card.boundingBox()
        await card.hover()
        await expect(card.locator('.warmup-preview')).toBeVisible()
        const after = await card.boundingBox()
        expect(after!.width).toBeCloseTo(before!.width)
        expect(after!.height).toBeCloseTo(before!.height)
        expect(await card.locator('.warmup-preview').evaluate(el => el.getAnimations({ subtree: true }).some(a => a.playState === 'running'))).toBe(true)
        await page.mouse.move(0, 0)
        await expect(card.locator('.warmup-preview')).toHaveCount(0)
      }
    }
    await filters.getByRole('button', { name: /Todos/ }).focus()
    await page.keyboard.press('Enter')
    await expect(cards).toHaveCount(8)
    await page.keyboard.press('Tab')
    await expect(filters.getByRole('button', { name: /Precisão/ })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(cards).toHaveCount(4)
    await filters.getByRole('button', { name: /Todos/ }).click()
    await page.mouse.move(0, 0)
    const width = page.viewportSize()!.width
    const columns = await page.locator('.warmup-exercises').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(width >= 1500 ? 4 : width > 900 ? 3 : width > 560 ? 2 : 1)
    for (const card of await cards.all()) {
      const height = (await card.boundingBox())!.height
      expect(height).toBeGreaterThanOrEqual(200)
      expect(height).toBeLessThanOrEqual(230)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.warmup-heading').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/catalog-${info.project.name}.png` })
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sensi-warmup-session')))).toEqual([])
  })

  test('supports two tablet columns and translated filters', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 })
    await page.locator('.xensi-reference-hero').getByRole('button', { name: 'Começar agora', exact: true }).click()
    expect(await page.locator('.warmup-exercises').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2)
    await page.screenshot({ path: `test-results/catalog-tablet-${test.info().project.name}.png` })
    for (const [locale, start, category] of [['en', 'Start now', 'Precision'], ['es', 'Empezar ahora', 'Precisión']]) {
      await page.evaluate(value => localStorage.setItem('sensi-locale', value), locale)
      await page.goto('./')
      await page.locator('.xensi-reference-hero').getByRole('button', { name: start, exact: true }).click()
      await page.locator('.warmup-category-filters').getByRole('button', { name: new RegExp(category) }).click()
      await expect(page.locator('.warmup-exercises > button')).toHaveCount(4)
    }
  })

  test('keeps Home and Analysis headings without decorative labels', async ({ page }, info) => {
    await expect(page.getByText('PRECISÃO PARA FPS', { exact: true })).toHaveCount(0)
    await expect(page.locator('.xensi-reference-copy h1')).toBeVisible()
    await page.screenshot({ path: `test-results/home-heading-${info.project.name}.png` })
    await page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'ANÁLISE', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Análise', exact: true })).toBeVisible()
    await expect(page.getByText('LEITURA DE DESEMPENHO', { exact: true })).toHaveCount(0)
    await expect(page.locator('.analysis-metric-strip')).toBeVisible()
    await page.screenshot({ path: `test-results/analysis-heading-${info.project.name}.png` })
    await page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'CALIBRAR', exact: true }).click()
    await page.getByRole('menuitem', { name: /Como funciona/ }).click()
    await expect(page.getByRole('heading', { name: 'Como funciona a calibração' })).toBeVisible()
    await expect(page.locator('.analysis-method-grid > article')).toHaveCount(0)
    await expect(page.locator('.analysis-method-steps > article')).toHaveCount(5)
    await expect(page.locator('.analysis-method-table').first().locator('> div')).toHaveCount(6)
    await expect(page.getByRole('heading', { name: 'Limitações' })).toBeVisible()
    await expect(page.getByText('LEITURA DE DESEMPENHO', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `test-results/method-heading-${info.project.name}.png` })
  })
})

import { expect, test } from '@playwright/test'

test.describe('Universal design environment', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
    await page.goto('/profile')
  })

  test('preserves the background and chrome through route changes and browser history', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible()
    await page.locator('.xensi-global-ambient').evaluate(element => { element.setAttribute('data-continuity-probe', 'original') })
    const logo = await page.getByRole('button', { name: 'XENSI home' }).evaluate(element => ({ text: element.textContent, font: getComputedStyle(element).fontFamily, spacing: getComputedStyle(element).letterSpacing }))
    await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Análise', exact: true })).toBeVisible()
    await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-continuity-probe', 'original')
    await expect(page.locator('.xensi-universal-shell')).toHaveAttribute('data-atmosphere', 'analysis')
    await expect(page.locator('.xensi-home-v3-footer')).toHaveCount(1)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible()
    await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-continuity-probe', 'original')
    expect(await page.getByRole('button', { name: 'XENSI home' }).evaluate(element => ({ text: element.textContent, font: getComputedStyle(element).fontFamily, spacing: getComputedStyle(element).letterSpacing }))).toEqual(logo)
    expect(errors).toEqual([])
  })

  test('keeps all presentation pages and isolated auth readable within the viewport', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const route of ['/', '/train', '/calibrate', '/convert', '/diagnostics', '/analysis', '/profile', '/train/routines', '/sobre']) {
      await page.goto(route)
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(page.locator('.xensi-home-v3-footer')).toHaveCount(1)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const bounds = await page.getByRole('heading', { level: 1 }).first().evaluate(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: innerWidth } })
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.width)
    }
    await page.goto('/login')
    await expect(page.locator('.xensi-auth-page')).toBeVisible()
    await expect(page.locator('.xensi-navigation')).toHaveCount(0)
    await expect(page.locator('.xensi-home-v3-footer')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('creates and filters actual presets with usable spotlight surfaces', async ({ page, isMobile }) => {
    await page.getByRole('button', { name: 'Adicionar sensibilidade', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Adicionar sensibilidade', exact: true })
    await dialog.getByRole('textbox', { name: 'Sensibilidade', exact: true }).fill('0.65')
    await dialog.getByRole('textbox', { name: 'DPI', exact: true }).fill('800')
    await dialog.getByRole('textbox', { name: /Nome do preset/ }).fill('Precisão')
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click()
    const card = page.locator('.profile-preset-card').first()
    await expect(card).toContainText('0.65')
    await expect(card).toContainText('800')
    if (!isMobile) {
      await card.hover()
      await expect(card).toHaveAttribute('data-spotlight-active', 'true')
      await expect(card.locator('.xensi-surface-light')).toHaveCSS('opacity', '1')
    }
    const search = page.getByRole('textbox', { name: /Buscar configurações/ })
    await search.fill('nenhum preset')
    await expect(page.getByText('Nenhuma sensibilidade encontrada.')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar busca' }).click()
    await expect(card).toContainText('Precisão')
    await card.getByRole('button', { name: 'Converter', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Sensibilidade atual', exact: true })).toHaveValue('0.65')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('stops ambient activity when hidden and in every measurement route', async ({ page }) => {
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
    await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-paused', 'true')
    await expect(page.locator('.xensi-ambient-light')).toHaveCSS('animation-play-state', 'paused')
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
    await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-paused', 'false')
    for (const route of ['polling-rate', 'input', 'refresh-rate', 'controller-drift']) {
      await page.goto(`/diagnostics/${route}`)
      await expect(page.locator('.xensi-universal-shell')).toHaveAttribute('data-ui-paused', 'true')
      await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-paused', 'true')
      expect(await page.locator('.xensi-global-ambient').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
    }
  })
})

test.describe('Universal reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('keeps final values and controls visible without ambient tracking', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
    await page.goto('/profile')
    await expect(page.locator('.xensi-global-ambient')).toHaveAttribute('data-paused', 'true')
    await expect(page.locator('.xensi-ambient-light')).toHaveCSS('animation-name', 'none')
    await page.getByRole('button', { name: 'Editar perfil', exact: true }).focus()
    await expect(page.locator('.profile-v1-identity .xensi-surface-light')).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'CONVERTER', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Sensibilidade atual', exact: true })).toBeVisible()
    expect(await page.locator('.xensi-global-ambient').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  })
})

import { expect, test } from '@playwright/test'

test.describe('Readable XENSI navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('sensi-locale')) localStorage.setItem('sensi-locale', 'pt')
      localStorage.setItem('xensi-auth-user-id', 'navbar-test-user')
    })
    await page.goto('./')
  })

  test('shows a compact login action instead of fake profile when signed out', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('xensi-auth-user-id')
      localStorage.removeItem('xensi-auth-user')
      localStorage.removeItem('xensi-user-id')
      localStorage.removeItem('xensi-current-user')
      window.dispatchEvent(new Event('xensi-auth-updated'))
    })

    const login = page.locator('.xensi-login-trigger')
    await expect(login).toBeVisible()
    await expect(login).toHaveAccessibleName('Login')
    await expect(login).toContainText('Login')
    await expect(page.locator('.xensi-user-trigger')).toHaveCount(0)
    await expect(page.locator('.xensi-nav-actions .xensi-avatar')).toHaveCount(0)

    await login.click()
    await expect(page).toHaveURL(/(\/Sensi)?\/login$/)
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  })

  test('opens only Minigames and Routines and preserves their destinations', async ({ page }) => {
    const trigger = page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'Treinar', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Treinar', exact: true })
    await expect(menu.getByRole('menuitem')).toHaveCount(2)
    await expect(menu.locator('.xensi-nav-dropdown-label')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(menu.getByRole('menuitem', { name: /Minigames/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.warmup-exercises > button')).toHaveCount(7)
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: /Minigames/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: /Rotinas/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.routine-workspace')).toBeVisible()
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page).toHaveURL(/(\/Sensi)?\/train\/routines$/)
  })

  test('renders readable menus, aligned user controls and contained dropdowns', async ({ page }, info) => {
    const nav = page.locator('.xensi-navigation')
    const primary = page.locator('.xensi-primary-nav')
    expect(await primary.getByRole('button', { name: 'Treinar', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
    if (page.viewportSize()!.width > 1080) {
      expect(await primary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const user = page.locator('.xensi-user-trigger')
      await expect(user.locator('b')).toBeVisible()
      await expect(user.locator('b')).toHaveCSS('font-size', '14px')
      const avatar = await user.locator('.xensi-avatar').boundingBox()
      const nick = await user.locator('b').boundingBox()
      expect(Math.abs(avatar!.y + avatar!.height / 2 - nick!.y - nick!.height / 2)).toBeLessThan(3)
    }
    for (const type of ['train', 'calibrate', 'diagnostic', 'profile']) {
      const trigger = type === 'profile' ? page.locator('.xensi-user-trigger') : primary.getByRole('button', { name: { train: 'Treinar', calibrate: 'Calibrar', diagnostic: 'Diagnóstico' }[type], exact: true })
      await trigger.click()
      const menu = page.locator('.xensi-nav-dropdown')
      await expect(menu).toBeVisible()
      await expect(menu).toHaveCSS('opacity', '1')
      await expect(menu.locator('button b').first()).toHaveCSS('font-size', '15px')
      if (type === 'train' || type === 'diagnostic') {
        await expect(menu.locator('small').first()).toHaveCSS('font-size', '13px')
        await expect(menu.locator('small').first()).toHaveCSS('color', 'rgb(167, 175, 184)')
      }
      const box = (await menu.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      await page.screenshot({ path: `test-results/navbar-${type}-${info.project.name}.png`, animations: 'disabled' })
      if (type === 'profile') {
        await menu.getByRole('button', { name: 'Meu perfil', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible()
      } else await page.keyboard.press('Escape')
    }
    expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(74)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('translates both training entries', async ({ page }) => {
    for (const [locale, trigger, names] of [
      ['en', 'TRAIN', ['Minigames Individual exercises', 'Routines Training sequences']],
      ['es', 'ENTRENAR', ['Minijuegos Ejercicios individuales', 'Rutinas Secuencias de entrenamiento']],
    ] as const) {
      await page.evaluate(value => localStorage.setItem('sensi-locale', value), locale)
      await page.reload()
      await page.getByRole('button', { name: trigger, exact: true }).click()
      const items = page.getByRole('menu', { name: trigger, exact: true }).getByRole('menuitem')
      await expect(items).toHaveCount(2)
      await expect(items.nth(0)).toHaveAccessibleName(names[0])
      await expect(items.nth(1)).toHaveAccessibleName(names[1])
    }
  })

  test('translates the Calibrate documentation item', async ({ page }) => {
    for (const [locale, trigger, documentationName] of [
      ['pt', 'Calibrar', 'Como funciona Entenda o método de calibração.'],
      ['en', 'CALIBRATE', 'How it works Understand the calibration method.'],
      ['es', 'Calibrar', 'Cómo funciona Entiende el método de calibración.'],
    ] as const) {
      await page.evaluate(value => localStorage.setItem('sensi-locale', value), locale)
      await page.reload()
      await page.getByRole('button', { name: trigger, exact: true }).click()
      await expect(page.getByRole('menu', { name: trigger, exact: true }).getByRole('menuitem').nth(2)).toHaveAccessibleName(documentationName)
    }
  })

  test('keeps the Calibrate dropdown hierarchy clear', async ({ page }, info) => {
    await page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'Calibrar', exact: true }).click()
    const menu = page.getByRole('menu', { name: 'Calibrar' })
    await expect(menu).toBeVisible()
    const items = menu.getByRole('menuitem')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toHaveAccessibleName('Calibrar sensibilidade Encontre uma região de sensibilidade para testar.')
    await expect(items.nth(1)).toHaveAccessibleName('Histórico Consulte calibrações anteriores.')
    await expect(items.nth(2)).toHaveAccessibleName('Como funciona Entenda o método de calibração.')
    await expect(menu.locator('.xensi-nav-dropdown-divider')).toHaveCount(1)

    await items.nth(2).click()
    await expect(page.getByRole('heading', { name: 'Como o XENSI mede' })).toBeVisible()
    await page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'Calibrar', exact: true }).click()
    const documentationItem = page.getByRole('menuitem', { name: /Como funciona/ })
    await expect(documentationItem).toHaveAttribute('aria-current', 'page')
    await expect(documentationItem).toHaveCSS('box-shadow', 'none')
    await expect(documentationItem).not.toHaveCSS('background-color', 'rgb(255, 70, 87)')
    await page.screenshot({ path: `test-results/calibrate-dropdown-${info.project.name}.png`, animations: 'disabled' })
  })
})

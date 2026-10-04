import { expect, test, type Page } from '@playwright/test'

async function useStoredLocale(page: Page, locale: 'pt' | 'en' | 'es') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('sensi-locale', value)
  }, locale)
}

async function useBrowserLanguage(page: Page, language: string) {
  await page.addInitScript((value) => {
    window.localStorage.removeItem('sensi-locale')
    Object.defineProperty(window.navigator, 'language', { value, configurable: true })
    Object.defineProperty(window.navigator, 'languages', { value: [value], configurable: true })
  }, language)
}

test.describe('XENSI auth routes', () => {
  test('restores login from the GitHub Pages SPA fallback query', async ({ page }) => {
    await useStoredLocale(page, 'pt')
    await page.goto('./?xensi-route=login')

    await expect(page).toHaveURL(/(\/Sensi)?\/login$/)
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  })

  test('renders login, handles unavailable auth, and keeps the desktop viewport contained', async ({ page }, testInfo) => {
    await useStoredLocale(page, 'pt')
    await page.goto('./login')

    await expect(page).toHaveURL(/(\/Sensi)?\/login$/)
    await expect(page.locator('.xensi-auth-page')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
    await expect(page.getByText('Acesse sua conta para sincronizar seu progresso.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar sem conta' })).toBeVisible()
    await expect(page.getByText('Lembrar de mim')).toHaveCount(0)
    await expect(page.locator('.app-header')).toHaveCount(0)

    await page.evaluate(async () => { await document.fonts.ready })
    await expect.poll(() => page.locator('.xensi-auth-shell').evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
    const card = await page.locator('.xensi-auth-card').boundingBox()
    const viewport = page.viewportSize()
    expect(card).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(Math.abs((card!.x + card!.width / 2) - viewport!.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs((card!.y + card!.height / 2) - viewport!.height / 2)).toBeLessThanOrEqual(2)

    const overflow = await page.evaluate(() => ({
      viewportHeight: document.documentElement.clientHeight,
      contentHeight: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }))
    expect(overflow.contentHeight).toBeLessThanOrEqual(overflow.viewportHeight)
    expect(overflow.contentWidth).toBeLessThanOrEqual(overflow.viewportWidth)

    await page.getByLabel('E-mail').fill('player@xensi.test')
    const password = page.locator('#auth-password')
    await password.fill('controle123')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Mostrar senha' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Ocultar senha' }).click()
    await expect(password).toHaveAttribute('type', 'password')

    await page.locator('.xensi-auth-submit').click()
    await expect(page.getByRole('alert')).toContainText('Autenticação ainda não configurada')

    await testInfo.attach(`login-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: false, animations: 'disabled' }),
      contentType: 'image/png',
    })
  })

  test('continues as guest from login without requiring an account', async ({ page }) => {
    await useStoredLocale(page, 'pt')
    await page.goto('./login')

    await page.getByRole('button', { name: 'Continuar sem conta' }).click()

    await expect(page).toHaveURL(/(\/Sensi)?\/$/)
    await expect(page.locator('.xensi-auth-page')).toHaveCount(0)
    await expect(page.locator('.app-shell')).toBeVisible()
  })

  test('links to register and forgot password routes with the same auth surface', async ({ page }) => {
    await useStoredLocale(page, 'pt')
    await page.goto('./login')

    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/(\/Sensi)?\/register$/)
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible()
    await expect(page.locator('#auth-password')).toHaveAttribute('autocomplete', 'new-password')

    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/(\/Sensi)?\/login$/)

    await page.getByRole('button', { name: 'Esqueceu a senha?' }).click()
    await expect(page).toHaveURL(/(\/Sensi)?\/forgot-password$/)
    await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toHaveAttribute('autocomplete', 'email')
    await expect(page.locator('#auth-password')).toHaveCount(0)
  })

  test('localizes login copy from the browser language when no saved preference exists', async ({ page }) => {
    await useBrowserLanguage(page, 'en-US')
    await page.goto('./login')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByText('Sign in to sync your progress.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue without an account' })).toBeVisible()

    await page.context().clearCookies()
    await useBrowserLanguage(page, 'es-ES')
    await page.goto('./login')

    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()
    await expect(page.getByText('Entra en tu cuenta para sincronizar tu progreso.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible()
    await expect(page.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar sin cuenta' })).toBeVisible()
  })
})

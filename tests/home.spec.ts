import { expect, test } from '@playwright/test'

test.describe('XENSI landing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
      window.localStorage.setItem('sensi-locale', 'pt')
    })
    await page.goto('./')
  })

  test('renders hero, proof, loop, training, tools, analysis, final CTA and footer', async ({ page }, testInfo) => {
    await expect(page.getByText('Gratuito para começar')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Treine melhor\. Jogue diferente\./ })).toBeVisible()
    await expect(page.locator('.xl-hero').getByRole('button', { name: /Começar agora/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Testar meu setup/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Do setup ao resultado.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Escolha sua modalidade.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ajuste o setup antes de culpar a mira.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sua evolução, em dados reais.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seu próximo treino começa agora.' })).toBeVisible()
    await expect(page.getByText('Feito por jogadores, para jogadores.')).toBeVisible()

    const footer = page.locator('.xensi-home-v3-footer')
    await footer.scrollIntoViewIfNeeded()
    const footerLayout = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth, bottomGap: document.documentElement.scrollHeight - (window.scrollY + rect.bottom) }
    })
    expect(Math.round(footerLayout.left)).toBe(0)
    expect(Math.round(footerLayout.right)).toBe(footerLayout.viewport)
    expect(Math.abs(footerLayout.bottomGap)).toBeLessThanOrEqual(1)

    await testInfo.attach(`landing-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })
  })

  test('uses the supplied photographic hero', async ({ page }) => {
    await expect(page.locator('.xl-hero-photo')).toHaveCSS('background-image', /xensi-home-hero-bg/)
  })

  test('exercise count comes from the product registry', async ({ page }) => {
    await expect(page.getByText(/9 exercícios no catálogo/)).toBeVisible()
    await expect(page.locator('.xl-ex-card')).toHaveCount(9)
  })

  test('hides the progress section for a new visitor and shows real saved data', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Continue de onde parou.' })).toHaveCount(0)
    await page.evaluate(async () => {
      const now = new Date().toISOString()
      window.localStorage.setItem('xensi-player-profile', JSON.stringify({
        nickname: 'xensi_dev', avatarId: 'cat-focus',
        presets: [{ id: 'preset-cs2', gameId: 'cs2', name: 'CS2 base', sensitivity: 0.68, dpi: 800, isPrimary: true, createdAt: now, updatedAt: now }],
      }))
      window.localStorage.setItem('xensi-routine-library:v1', JSON.stringify([{
        id: 'routine-home', name: 'Rotina controle', gameId: 'cs2',
        items: [
          { id: 'one', modeId: 'flick', durationSeconds: 120, difficulty: 'medium', order: 0 },
          { id: 'two', modeId: 'tracking', durationSeconds: 180, difficulty: 'medium', order: 1 },
        ],
        createdAt: now, updatedAt: now,
      }]))
      window.dispatchEvent(new Event('xensi-profile-updated'))
      window.dispatchEvent(new Event('xensi-routines-updated'))
    })
    const progress = page.locator('.xl-progress')
    await expect(progress.getByRole('heading', { name: 'Continue de onde parou.' })).toBeVisible()
    await expect(progress.getByText('CS2 base')).toBeVisible()
    await expect(progress.getByText('544')).toBeVisible()
    await expect(progress.getByText('Rotina controle')).toBeVisible()
    await expect(progress.getByText('5 min')).toBeVisible()
    await expect(progress.getByText('0%', { exact: true })).toHaveCount(0)
  })

  test('reaction demo measures five real clicks and links to Reflex', async ({ page }) => {
    const demo = page.getByTestId('home-reaction-demo')
    await demo.getByRole('button', { name: 'Valendo' }).click()
    for (let index = 0; index < 5; index++) {
      const target = demo.locator('.xl-demo-target')
      await target.waitFor({ state: 'visible' })
      await target.click()
    }
    await expect(demo.locator('.xl-demo-stats')).toContainText(/\d+ ms/)
    await demo.getByRole('button', { name: 'Treinar Reflex' }).click()
    await expect(page).toHaveURL(/\/train\/reaction$/)
  })

  test('live converter uses the conversion engine', async ({ page }) => {
    const converter = page.locator('.xl-conv')
    await converter.getByLabel('Sensibilidade').fill('1.6')
    await converter.getByLabel('DPI').fill('800')
    await expect(converter.locator('.xl-conv-out b')).toHaveText('0.503')
    await converter.getByRole('button', { name: /Abrir conversor completo/ }).click()
    await expect(page).toHaveURL(/\/convert$/)
  })

  test('exercise filters and cards open the selected exercise', async ({ page }) => {
    await page.getByRole('group', { name: 'Filtrar exercícios por habilidade' }).getByRole('button', { name: 'Tracking' }).click()
    await expect(page.locator('.xl-ex-card')).toHaveCount(2)
    await page.locator('.xl-ex-card[data-exercise="strafetrack"]').click()
    await expect(page).toHaveURL(/\/train\/strafetrack$/)
  })

  test('opens destinations and preserves the navigation background', async ({ page }) => {
    const header = page.locator('.app-header')
    const initialBackground = await header.evaluate((element) => getComputedStyle(element).backgroundImage)
    const assertHeader = async () => expect(await header.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(initialBackground)

    await page.locator('.xl-hero').getByRole('button', { name: /Começar agora/ }).click()
    await expect(page.getByRole('heading', { name: /Prepare a mira antes da partida/i })).toBeVisible()
    await assertHeader()
    await page.getByRole('button', { name: /XENSI home/i }).click()

    await page.getByRole('button', { name: /Testar meu setup/ }).click()
    await expect(page.getByRole('heading', { name: 'Diagnóstico de entrada', exact: true })).toBeVisible()
    await assertHeader()
    await page.getByRole('button', { name: /XENSI home/i }).click()

    await page.getByRole('button', { name: /Explorar diagnósticos/ }).click()
    await expect(page.getByRole('heading', { name: /Quatro checagens/i })).toBeVisible()
    await assertHeader()
    await page.getByRole('button', { name: /XENSI home/i }).click()

    await page.getByRole('button', { name: /Ver minha análise/ }).click()
    await expect(page.getByRole('heading', { name: 'Análise', exact: true })).toBeVisible()
  })

  test('has no horizontal page overflow', async ({ page }) => {
    const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport)
  })
})

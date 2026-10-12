import { expect, test, type Page } from '@playwright/test'

// The Home ("Radar sweep"): a scroll-driven hero radar that maps the modules, the minigame strip,
// the calibrator and converter, the setup test and Squad Finder doors, and the closing call to action.

async function openHome(page: Page, options: { reduced?: boolean } = {}) {
  if (options.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.localStorage.setItem('sensi-locale', 'pt')
  })
  await page.goto('./')
}

test.describe('XENSI home', () => {
  test('renders every section in order with real headings', async ({ page }, testInfo) => {
    await openHome(page)
    await expect(page.getByRole('heading', { level: 1, name: /Calibre a sensi\. Treine a mira\./ })).toBeVisible()
    for (const name of ['Treine e calibre com método.', 'Uma sensi que você consegue auditar.', 'A mesma sensação em outro jogo.', 'Antes da partida, e na hora de jogar.', 'Teste de setup', /Squad Finder/, /Seu próximo treino/]) {
      await expect(page.getByRole('heading', { name })).toHaveCount(1)
    }
    await expect(page.locator('.xr-mg-slice')).toHaveCount(9)
    await testInfo.attach(`home-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })
  })

  test('pins the hero and folds the radar into the section instrument', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1100, 'The pinned radar is the desktop hero.')
    await openHome(page)
    const instrument = page.getByRole('navigation', { name: 'Seções do XENSI' })
    await expect(instrument).toBeHidden()
    const hero = page.locator('[data-xr-hero]')
    const travel = await hero.evaluate(element => element.getBoundingClientRect().height - innerHeight)
    await page.evaluate(y => scrollTo(0, y * .4), travel)
    await expect(page.locator('.xr-stage')).toHaveJSProperty('offsetTop', await page.locator('.xr-stage').evaluate(element => element.offsetTop))
    expect(await page.locator('.xr-stage').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0)
    await expect(page.locator('.xr-blip.is-lit')).not.toHaveCount(0)
    await page.evaluate(y => scrollTo(0, y + 10), travel)
    await expect(instrument).toBeVisible()
    await instrument.getByRole('button', { name: 'Squad Finder' }).click()
    await expect.poll(() => page.locator('#xr-squad').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(200)
  })

  test('converter example comes from the conversion engine', async ({ page }) => {
    await openHome(page, { reduced: true })
    const equation = page.getByRole('img', { name: /Exemplo: 0.5 no Counter-Strike 2 equivale a 0.157 no Valorant a 1600 DPI/ })
    await expect(equation).toContainText('0.50')
    await expect(equation).toContainText('0.157')
    await expect(page.getByText('1600 DPI · 51,95 cm por giro nos dois jogos')).toBeVisible()
  })

  test('minigame panels open their exercise', async ({ page }) => {
    await openHome(page, { reduced: true })
    await page.getByRole('listitem', { name: 'Jogar Strafetrack' }).click()
    await expect(page).toHaveURL(/\/train\/strafetrack$/)
  })

  test('calls to action reach their destinations', async ({ page }) => {
    await openHome(page, { reduced: true })
    const destinations: Array<[RegExp | string, RegExp]> = [
      ['Testar meu setup', /\/diagnostics$/],
      ['Encontrar squad', /\/squad$/],
      ['Abrir conversor', /\/convert$/],
      ['Montar rotina', /\/train\/routines$/],
    ]
    for (const [name, url] of destinations) {
      await page.getByRole('button', { name, exact: true }).click()
      await expect(page).toHaveURL(url)
      await page.goto('./')
    }
    await page.locator('.xr-copy').getByRole('button', { name: 'Começar a treinar' }).click()
    await expect(page).toHaveURL(/\/train$/)
  })

  test('hides the progress section for a new visitor and shows real saved data', async ({ page }) => {
    await openHome(page, { reduced: true })
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
    const progress = page.locator('.xr-progress')
    await expect(progress.getByRole('heading', { name: 'Continue de onde parou.' })).toBeVisible()
    await expect(progress.getByText('CS2 base')).toBeVisible()
    await expect(progress.getByText('544')).toBeVisible()
    await expect(progress.getByText('Rotina controle')).toBeVisible()
    await expect(progress.getByText('5 min')).toBeVisible()
  })

  test('reduced motion shows complete static sections without pinned travel', async ({ page }) => {
    await openHome(page, { reduced: true })
    expect(await page.locator('[data-xr-hero]').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(await page.evaluate(() => innerHeight) + 2)
    await expect(page.locator('.xr-blip.is-lit')).toHaveCount(5)
    await expect(page.locator('[data-xr-ruler]')).toHaveAttribute('data-stage', '3')
  })

  test('has no horizontal page overflow', async ({ page }) => {
    await openHome(page)
    const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport)
  })
})

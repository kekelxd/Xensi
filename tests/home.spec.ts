import { expect, test } from '@playwright/test'

test.describe('XENSI home v3', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
      window.localStorage.setItem('sensi-locale', 'pt')
    })
    await page.goto('./')
  })

  test('renders the new hero, CTAs, pathways, ecosystem and footer', async ({ page }, testInfo) => {
    await expect(page.getByText('PERFORMANCE, COM PROPÓSITO')).toHaveCount(0)
    await expect(page.getByText('FEITO PARA SUA EVOLUÇÃO')).toHaveCount(0)
    await expect(page.getByText('Gratuito para começar')).toHaveCount(0)
    await expect(page.getByText('Sem compromisso')).toHaveCount(0)
    await expect(page.getByText('Feito para jogadores reais')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Treine melhor\. Jogue diferente\./ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Começar agora/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Testar meu setup/ })).toBeVisible()
    await expect(page.getByText('Dois focos. Uma evolução.')).toBeVisible()
    await expect(page.getByText('Treino e Performance')).toBeVisible()
    await expect(page.getByText('Diagnóstico do Setup')).toBeVisible()
    await expect(page.getByText('Continue de onde parou.')).toBeVisible()
    await expect(page.getByText('Mais que ferramentas. Um ecossistema.')).toBeVisible()
    await expect(page.getByText('Feito por jogadores, para jogadores.')).toBeVisible()

    const footer = page.locator('.xensi-home-v3-footer')
    await footer.scrollIntoViewIfNeeded()
    const footerLayout = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        viewport: document.documentElement.clientWidth,
        bottomGap: document.documentElement.scrollHeight - (window.scrollY + rect.bottom),
      }
    })
    expect(Math.round(footerLayout.left)).toBe(0)
    expect(Math.round(footerLayout.right)).toBe(footerLayout.viewport)
    expect(Math.abs(footerLayout.bottomGap)).toBeLessThanOrEqual(1)

    await testInfo.attach(`home-v3-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    })
  })

  test('shows elegant empty progress states without invented metrics', async ({ page }) => {
    await expect(page.getByText('Complete um treino para continuar daqui.')).toBeVisible()
    await expect(page.getByText('Adicione um preset no perfil para ver sua referência principal.')).toBeVisible()
    await expect(page.getByText('Salve uma rotina para retomar sua playlist com um clique.')).toBeVisible()
    await expect(page.locator('.xensi-home-v3-progress-card').getByText('0%', { exact: true })).toHaveCount(0)
    await expect(page.locator('.xensi-home-v3-progress-card').getByText('0ms', { exact: true })).toHaveCount(0)
  })

  test('uses saved training, preset and routine data in the continuation cards', async ({ page }) => {
    await page.evaluate(async () => {
      const { getSessionRepository } = await import('/src/sessionRepository.ts')
      const { exerciseConfig, comparisonSignature, sessionMetrics } = await import('/src/trainingSession.ts')
      const now = new Date().toISOString()
      const metrics = {
        completedAt: now,
        score: 1280,
        accuracy: 92,
        hits: 46,
        shots: 50,
        onTargetMs: 18000,
        reactionTimeMs: 184,
        clickErrors: 2,
        bestStreak: 12,
        bestTrackingStreakMs: 0,
        overshootCount: 3,
        correctionCount: 8,
      }
      const config = exerciseConfig('gridshot', 'medium', 'medium', 60, 1440, 900, 'dot')
      await getSessionRepository().append({ kind: 'session', value: {
        id: crypto.randomUUID(), userId: null, exerciseId: 'gridshot', startedAt: new Date(Date.parse(now) - 60000).toISOString(), finishedAt: now,
        durationMs: 60000, status: 'completed', invalidReason: null, routineId: null, routineRunId: null, routineStepId: null, presetId: null,
        context: { gameId: 'cs2', sensitivity: .68, dpi: 800 }, config, metrics: sessionMetrics('gridshot', { ...metrics, remaining: 0 }),
        comparisonSignature: comparisonSignature('gridshot', config), schemaVersion: 1, exerciseVersion: 1,
      } })
      window.localStorage.setItem('xensi-player-profile', JSON.stringify({
        nickname: 'xensi_dev',
        avatarId: 'cat-focus',
        presets: [{
          id: 'preset-cs2',
          gameId: 'cs2',
          name: 'CS2 base',
          sensitivity: 0.68,
          dpi: 800,
          isPrimary: true,
          createdAt: now,
          updatedAt: now,
        }],
      }))
      window.localStorage.setItem('xensi-routine-library:v1', JSON.stringify([{
        id: 'routine-home',
        name: 'Rotina controle',
        gameId: 'cs2',
        items: [
          { id: 'one', modeId: 'flick', durationSeconds: 120, difficulty: 'medium', order: 0 },
          { id: 'two', modeId: 'tracking', durationSeconds: 180, difficulty: 'medium', order: 1 },
        ],
        createdAt: now,
        updatedAt: now,
      }]))
      window.dispatchEvent(new Event('xensi-profile-updated'))
      window.dispatchEvent(new Event('xensi-routines-updated'))
    })

    const progress = page.locator('.xensi-home-v3-progress')
    await expect(progress.getByText('Gridshot')).toBeVisible()
    await expect(progress.getByText('92%')).toBeVisible()
    await expect(progress.getByText('184ms')).toBeVisible()
    await expect(progress.getByText('CS2 base')).toBeVisible()
    await expect(progress.getByText('544')).toBeVisible()
    await expect(progress.getByText('Rotina controle')).toBeVisible()
    await expect(progress.getByText('5 min')).toBeVisible()
  })

  test('uses the supplied photographic hero without the old demo arena', async ({ page }) => {
    const hero = page.locator('.xensi-home-v3-hero')
    await expect(hero).toBeVisible()
    await expect(hero).toHaveCSS('background-image', /xensi-home-hero-bg/)
    await expect(hero.getByText('DISCIPLINA', { exact: true })).toHaveCount(0)
    await expect(hero.getByText('DADOS', { exact: true })).toHaveCount(0)
    await expect(hero.getByText('EVOLUÇÃO', { exact: true })).toHaveCount(0)
    await expect(page.getByText('MAIS CONTROLE. MAIS RESULTADOS.')).toHaveCount(0)
    await expect(page.getByTestId('home-training-demo')).toHaveCount(0)
    await expect(page.locator('.xensi-reference-target')).toHaveCount(0)
  })

  test('opens home destinations and preserves the navigation background', async ({ page }) => {
    const header = page.locator('.app-header')
    const initialBackground = await header.evaluate((element) => getComputedStyle(element).backgroundImage)
    const assertHeader = async () => expect(await header.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(initialBackground)

    await page.getByRole('button', { name: /Começar agora/ }).click()
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

    await page.getByRole('button', { name: /Conheça o XENSI/ }).click()
    await expect(page.getByRole('heading', { name: 'Análise', exact: true })).toBeVisible()
    await assertHeader()
  })

  test('has hover transitions and no horizontal page overflow', async ({ page }) => {
    const pathCard = page.locator('.xensi-home-v3-path-card').first()
    await pathCard.hover()
    await expect(pathCard).toHaveCSS('transition-duration', /0\.2s/)
    const iconTransform = await pathCard.locator('.xensi-home-v3-icon').evaluate((element) => getComputedStyle(element).transform)
    expect(iconTransform).not.toBe('none')

    const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport)
  })
})

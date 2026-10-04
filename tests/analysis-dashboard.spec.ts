import { expect, test } from '@playwright/test'

const calibration = (id: string, completedAt: string, sensitivity: number, accuracy: number, consistency: number) => ({
  id,
  completedAt,
  sensitivity,
  rangeMinSensitivity: sensitivity - 0.02,
  rangeMaxSensitivity: sensitivity + 0.02,
  multiplier: 1,
  score: accuracy,
  accuracy,
  meanError: 24,
  smoothness: 86,
  overshoots: 2,
  confidenceScore: 88,
  collectionQualityScore: 90,
  playerConsistencyScore: consistency,
  recommendationStrengthScore: 82,
  resultKind: 'recommended',
  dpi: 1600,
  horizontalFov: 106,
  cmPer360: 37.11,
})

const warmup = (completedAt: string, accuracy: number, reactionTimeMs = 0, sensitivity = 0.61) => ({
  completedAt,
  score: Math.round(accuracy * 10),
  accuracy,
  hits: 42,
  shots: 50,
  onTargetMs: 26000,
  reactionTimeMs,
  clickErrors: 2,
  bestStreak: 8,
  bestTrackingStreakMs: 3200,
  overshootCount: 2,
  correctionCount: 14,
  sessionContext: { gameId: 'cs2', sensitivity, dpi: 1600, presetId: 'preset-cs2', configuration: { difficulty: 'Normal', durationSeconds: 60 } },
})

const sniper = (completedAt: string, reactionTimeMs: number, bestReactionMs: number) => ({
  completedAt,
  score: 600,
  accuracy: 91,
  hits: 10,
  shots: 11,
  onTargetMs: 0,
  reactionTimeMs,
  clickErrors: 1,
  bestStreak: 4,
  bestTrackingStreakMs: 0,
  overshootCount: 0,
  correctionCount: 0,
  sniper: { hits: 10, shots: 11, misses: 1, noShots: 0, attempts: 11, accuracy: 91, reactionTimeMs, bestReactionMs, medianReactionMs: reactionTimeMs, consistency: 84, earlyShots: 0 },
  sessionContext: { gameId: 'cs2', sensitivity: 0.61, dpi: 1600, presetId: 'preset-cs2', configuration: { difficulty: 'Normal', durationSeconds: 60 } },
})

const seedAnalysisData = {
  tracking: {
    ...warmup('2026-09-06T18:42:00.000Z', 87.4),
    history: [
      warmup('2026-08-23T18:42:00.000Z', 76.9, 0, 0.65),
      warmup('2026-09-02T18:42:00.000Z', 84.2, 0, 0.61),
      warmup('2026-09-06T18:42:00.000Z', 87.4, 0, 0.61),
    ],
  },
  sniper: {
    ...sniper('2026-09-06T18:35:00.000Z', 184, 178),
    history: [
      sniper('2026-08-25T18:35:00.000Z', 202, 190),
      sniper('2026-09-06T18:35:00.000Z', 184, 178),
    ],
  },
  calibration: [
    calibration('cal-new', '2026-09-06T18:30:00.000Z', 0.61, 91.2, 89),
    calibration('cal-mid', '2026-09-01T18:30:00.000Z', 0.61, 88.4, 86),
    calibration('cal-old', '2026-08-24T18:30:00.000Z', 0.65, 82.1, 81),
  ],
}

test.describe('XENSI analysis dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sensi-locale', 'pt'))
    await page.goto('./')
    await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
  })

  test('shows an actionable empty state without fabricated zero trends', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Análise', exact: true })).toBeVisible()
    await expect(page.getByText('Ainda não há dados suficientes')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Começar treino' })).toBeVisible()
    await expect(page.getByText('Aguardando mais sessões')).toHaveCount(4)
    await expect(page.getByText('Nenhum recorde registrado')).toBeVisible()
    await page.getByRole('button', { name: 'Começar treino' }).click()
    await expect(page.getByRole('heading', { name: /Prepare a mira antes da partida/i })).toBeVisible()
  })

  test('uses saved sessions, preset snapshots, personal bests and sensitivity changes', async ({ page }, info) => {
    await page.evaluate(async (data) => {
      const { getSessionRepository } = await import('/src/sessionRepository.ts')
      const { exerciseConfig, comparisonSignature, sessionMetrics } = await import('/src/trainingSession.ts')
      window.localStorage.setItem('sensi-locale', 'pt')
      for (const [exerciseId, history] of [['tracking', data.tracking.history], ['sniper-reaction', data.sniper.history]] as const) {
        const config = exerciseConfig(exerciseId, 'medium', 'medium', 60, 1440, 900, 'dot')
        for (const summary of history) await getSessionRepository().database.save({ kind: 'session', value: {
          id: crypto.randomUUID(), userId: null, exerciseId, startedAt: new Date(Date.parse(summary.completedAt) - 60000).toISOString(), finishedAt: summary.completedAt,
          durationMs: 60000, status: 'completed', invalidReason: null, routineId: null, routineRunId: null, routineStepId: null, presetId: null,
          context: summary.sessionContext, config, metrics: sessionMetrics(exerciseId, { ...summary, remaining: 0 }),
          comparisonSignature: comparisonSignature(exerciseId, config), schemaVersion: 1, exerciseVersion: 1,
        } }, false)
      }
      window.localStorage.setItem('sensi-calibration-history:v1:cs2', JSON.stringify(data.calibration))
    }, seedAnalysisData)
    await page.reload()
    await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()

    await expect(page.getByText('91.0%')).toBeVisible()
    await expect(page.getByText(/vs período anterior/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '30D' })).toBeVisible()
    await page.getByRole('button', { name: '30D' }).click()
    await page.getByRole('tab', { name: 'Tracking' }).click()
    await expect(page.locator('.analysis-chart-wrap svg circle')).toHaveCount(3)
    await page.locator('.analysis-chart-wrap svg circle').last().hover()
    await expect(page.locator('.analysis-chart-tooltip')).toContainText('Tracking')
    await expect(page.locator('.analysis-chart-tooltip')).toContainText('CS2')
    await expect(page.locator('.analysis-chart-tooltip')).toContainText('0.610 · 1600 DPI')

    const personalBests = page.locator('.analysis-pb-panel')
    await expect(personalBests.getByText('Recordes pessoais')).toBeVisible()
    await expect(personalBests.getByText('87,4%')).toBeVisible()
    await expect(personalBests.getByText('178 ms')).toBeVisible()
    await expect(page.getByText('Sessões recentes')).toBeVisible()
    await expect(page.getByText('CS2 · 0.610 · 1600 DPI').first()).toBeVisible()

    await page.getByRole('button', { name: 'CALIBRAR', exact: true }).click()
    await page.getByRole('menuitem', { name: /Histórico/ }).click()
    await expect(page.getByText('0.650 → 0.610')).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'ANÁLISE', exact: true }).click()
    await expect(page.getByText('Recordes pessoais')).toBeVisible()
    await info.attach(`analysis-dashboard-${info.project.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    })
  })
})

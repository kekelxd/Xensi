import { expect, test } from '@playwright/test'

const routineLibraryKey = 'xensi-routine-library:v1'

const openRoutineLibrary = async (page: import('@playwright/test').Page) => {
  await page.goto('./')
  await page.getByRole('button', { name: /TREINAR/ }).click()
  await page.getByRole('menuitem', { name: /Rotinas/ }).click()
  await expect(page.getByRole('heading', { name: 'Rotinas', exact: true })).toBeVisible()
}

const openNewRoutineBuilder = async (page: import('@playwright/test').Page) => {
  await openRoutineLibrary(page)
  await page.getByRole('button', { name: 'Criar rotina', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Monte sua playlist de treino' })).toBeVisible()
}

test.describe('Saved routines library', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Rotinas salvas é validado apenas em desktop no MVP.')
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('custom-routine-library-ready')) {
        localStorage.clear()
        sessionStorage.setItem('custom-routine-library-ready', 'true')
      }
      localStorage.setItem('sensi-locale', 'pt')
    })
  })

  test('shows a real empty state when there are no saved routines', async ({ page }) => {
    await openRoutineLibrary(page)

    await expect(page.getByRole('heading', { name: 'Minhas rotinas' })).toBeVisible()
    await expect(page.getByText('Nenhuma rotina salva')).toBeVisible()
    await expect(page.locator('.routine-library-card')).toHaveCount(0)
  })

  test('creates, saves, returns to library and persists a routine after reload', async ({ page }) => {
    await openNewRoutineBuilder(page)

    const routineName = page.getByLabel('Nome da rotina')
    await routineName.fill('Rotina ranked')
    await expect(page.getByText('6 min', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^Salvar$/ }).click()
    await expect(page.getByRole('button', { name: 'Salvo' })).toBeVisible()
    await page.getByRole('button', { name: /Voltar para biblioteca/ }).click()

    await expect(page.locator('.routine-library-card')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Rotina ranked' })).toBeVisible()
    await expect(page.getByText('CS2 · sem preset salvo')).toBeVisible()
    await expect(page.getByText('Target Shooting · Tracking · Sniper Reaction')).toBeVisible()

    await page.reload()
    await openRoutineLibrary(page)
    await expect(page.getByRole('heading', { name: 'Rotina ranked' })).toBeVisible()
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), routineLibraryKey)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Rotina ranked')
  })

  test('edits, duplicates, renames and deletes a saved routine', async ({ page }) => {
    await page.addInitScript((key) => {
      if (sessionStorage.getItem('custom-routine-library-seeded')) return
      localStorage.setItem(key, JSON.stringify([{
        id: 'routine-ranked',
        name: 'Rotina ranked',
        gameId: 'cs2',
        items: [
          { id: 'one', modeId: 'flick', durationSeconds: 120, difficulty: 'medium', order: 0 },
          { id: 'two', modeId: 'tracking', durationSeconds: 180, difficulty: 'medium', order: 1 },
          { id: 'three', modeId: 'sniper-reaction', durationSeconds: 60, difficulty: 'medium', order: 2 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]))
      sessionStorage.setItem('custom-routine-library-seeded', 'true')
    }, routineLibraryKey)

    await openRoutineLibrary(page)
    await page.getByLabel('Ações de Rotina ranked').click()
    await page.getByRole('menuitem', { name: /Editar/ }).click()
    await expect(page.getByRole('heading', { name: 'Monte sua playlist de treino' })).toBeVisible()
    await page.getByLabel('Nome da rotina').fill('Rotina editada')
    await page.locator('.routine-builder-footer').getByRole('button', { name: /Adicionar exercício/ }).click()
    await page.getByRole('dialog', { name: 'Adicionar exercício' }).getByRole('button', { name: /Gridshot/ }).click()
    await page.getByRole('dialog', { name: 'Adicionar exercício' }).getByRole('button', { name: /Adicionar exercício/ }).click()
    await expect(page.locator('.routine-builder-item')).toHaveCount(4)
    await page.getByRole('button', { name: /^Salvar$/ }).click()
    await page.getByRole('button', { name: /Voltar para biblioteca/ }).click()
    await expect(page.getByRole('heading', { name: 'Rotina editada' })).toBeVisible()
    await expect(page.getByText('4 exercícios')).toBeVisible()

    await page.getByLabel('Ações de Rotina editada').click()
    await page.getByRole('menuitem', { name: /Duplicar/ }).click()
    await expect(page.getByRole('heading', { name: 'Rotina editada — cópia' })).toBeVisible()
    await expect(page.locator('.routine-library-card')).toHaveCount(2)

    await page.getByLabel('Ações de Rotina editada — cópia').click()
    await page.getByRole('menuitem', { name: /Renomear/ }).click()
    await page.getByRole('dialog', { name: 'Renomear rotina' }).getByLabel('Nome da rotina').fill('Tracking focus')
    await page.getByRole('dialog', { name: 'Renomear rotina' }).getByRole('button', { name: /Salvar nome/ }).click()
    await expect(page.getByRole('heading', { name: 'Tracking focus' })).toBeVisible()

    await page.getByLabel('Ações de Tracking focus').click()
    await page.getByRole('menuitem', { name: /Excluir/ }).click()
    await expect(page.getByRole('dialog', { name: 'Excluir rotina' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Excluir rotina' }).getByRole('button', { name: /^Excluir$/ }).click()
    await expect(page.getByRole('heading', { name: 'Tracking focus' })).toHaveCount(0)
    await expect(page.locator('.routine-library-card')).toHaveCount(1)

    await page.reload()
    await openRoutineLibrary(page)
    await expect(page.getByRole('heading', { name: 'Rotina editada' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tracking focus' })).toHaveCount(0)
  })
})

test.describe('Custom routine execution', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Pointer-lock execution is validated on desktop.')
    await page.addInitScript((key) => {
      if (sessionStorage.getItem('custom-routine-execution-seeded')) return
      localStorage.clear()
      localStorage.setItem('sensi-locale', 'pt')
      localStorage.setItem(key, JSON.stringify([{
        id: 'routine-test',
        name: 'Rotina smoke',
        gameId: 'cs2',
        items: [
          { id: 'one', modeId: 'flick', durationSeconds: 60, difficulty: 'easy', order: 0 },
          { id: 'two', modeId: 'tracking', durationSeconds: 60, difficulty: 'medium', order: 1 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]))
      Math.random = () => .5
      sessionStorage.setItem('custom-routine-execution-seeded', 'true')
    }, routineLibraryKey)
  })

  test('starts a saved routine directly from the library and records comparable PB duration context', async ({ page }) => {
    test.setTimeout(90000)
    await openRoutineLibrary(page)
    await page.clock.install()

    await page.locator('.routine-library-card').filter({ hasText: 'Rotina smoke' }).getByRole('button', { name: /^Iniciar$/ }).click()
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
    await page.clock.runFor(3500)
    await expect(page.getByText('Exercício 1 de 2')).toBeVisible()

    await page.clock.runFor(61000)
    await expect(page.getByText('Próximo: Tracking')).toBeVisible()
    await page.clock.runFor(3500)
    await expect(page.getByText('Exercício 2 de 2')).toBeVisible()

    await page.clock.runFor(61000)
    await expect(page.getByRole('heading', { name: 'Rotina smoke' })).toBeVisible()
    await expect(page.getByText('Rotina concluída')).toBeVisible()
    await expect(page.locator('.routine-result-list article')).toHaveCount(2)

    const records = await page.evaluate(async () => {
      const { getSessionRepository } = await import('/src/sessionRepository.ts')
      const database = getSessionRepository().database
      return { sessions: await database.sessions(null), runs: await database.runs(null) }
    })
    expect(records.sessions).toHaveLength(2)
    expect(records.runs).toHaveLength(1)
    expect(records.runs[0].status).toBe('completed')
    expect(records.sessions.every(s => s.routineRunId === records.runs[0].id && s.status === 'completed')).toBe(true)
    expect(records.sessions.find(s => s.exerciseId === 'flick')?.config).toMatchObject({ effectiveDifficulty: 'easy', durationSeconds: 60 })
    expect(records.sessions.find(s => s.exerciseId === 'tracking')?.config).toMatchObject({ effectiveDifficulty: 'medium', durationSeconds: 60 })
  })
})

import { expect, test, type Page } from '@playwright/test'
import { login, mockCloud, seedGuest, userA, userB, type RoutineRow } from './fixtures/accountCloud'

const routineId = '40000000-0000-4000-8000-000000000001'
const routine = { id: routineId, name: 'Guest routine', gameId: 'cs2', createdAt: '2026-09-05T12:00:00.000Z', updatedAt: '2026-09-05T12:00:00.000Z', items: [
  { id: '50000000-0000-4000-8000-000000000001', modeId: 'flick', order: 0, durationSeconds: 120, difficulty: 'hard' },
  { id: '50000000-0000-4000-8000-000000000002', modeId: 'tracking', order: 1, durationSeconds: 180, difficulty: 'adaptive' },
] }
const row = (name = 'Cloud routine', owner = userA): RoutineRow => ({ id: '60000000-0000-4000-8000-000000000001', user_id: owner, name, game_id: 'cs2', preset_id: null,
  created_at: routine.createdAt, updated_at: routine.updatedAt, training_routine_steps: routine.items.map(item => ({ id: item.id.replace('5000', '7000'), position: item.order, exercise_id: item.modeId, duration_seconds: item.durationSeconds, difficulty: item.difficulty })) })
async function seedRoutine(page: Page) { await page.evaluate(value => localStorage.setItem('xensi-routine-library:v1', JSON.stringify([value])), routine) }
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Criar nova rotina', exact: true }).click()
  await page.getByLabel('Nome da rotina').fill(name)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Salvo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Voltar para biblioteca' }).click()
}
async function signOut(page: Page) { await page.locator('.xensi-user-trigger').click(); await page.getByRole('button', { name: 'Sair', exact: true }).click() }
const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()) })
  await page.addInitScript(() => localStorage.setItem('sensi-locale', 'pt'))
})
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test.describe('Routines sync using the shared presets infrastructure', () => {
  test('guest reorders, edits, duplicates, renames and deletes; migration and reload keep UUIDs', async ({ page, context }, info) => {
    await mockCloud(context); await page.goto('/train/routines'); await seedRoutine(page); await page.reload()
    await expect(page).toHaveURL(/\/train\/routines$/); await expect(page).toHaveTitle('X')
    await page.getByLabel('Ações de Guest routine').click(); await page.getByRole('menuitem', { name: 'Editar', exact: true }).click()
    await page.getByRole('button', { name: 'Mover para baixo' }).first().click()
    await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(page.getByRole('button', { name: 'Salvo', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Voltar para biblioteca' }).click(); await page.reload()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('xensi-routine-library:v1')!)[0].items[0].modeId)).toBe('tracking')
    await page.getByLabel('Ações de Guest routine').click(); await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click()
    await expect(page.locator('.routine-library-card')).toHaveCount(2)
    await page.getByLabel('Ações de Guest routine — cópia').click(); await page.getByRole('menuitem', { name: 'Renomear', exact: true }).click()
    const rename = page.getByRole('dialog', { name: 'Renomear rotina' }); await rename.getByLabel('Nome da rotina').fill('Renamed copy'); await rename.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(page.getByRole('heading', { name: 'Renamed copy' })).toBeVisible()
    await page.getByLabel('Ações de Renamed copy').click(); await page.getByRole('menuitem', { name: 'Excluir', exact: true }).click(); await page.getByRole('dialog', { name: 'Excluir rotina' }).getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(page.locator('.routine-library-card')).toHaveCount(1)
    await page.screenshot({ path: info.outputPath('routines-library.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
  test('loads cloud, performs account CRUD and persists configuration after reload without touching guest', async ({ page, context }) => {
    const cloud = await mockCloud(context); cloud.routineRows.push(row())
    await login(page); await page.goto('/train/routines'); await expect(page.getByRole('heading', { name: 'Cloud routine' })).toBeVisible()
    await create(page, 'Account routine')
    await page.getByLabel('Ações de Account routine').click(); await page.getByRole('menuitem', { name: 'Editar', exact: true }).click()
    await page.getByLabel('Nome da rotina').fill('Edited routine')
    await page.getByRole('button', { name: 'Mover para baixo' }).first().click()
    await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(page.getByRole('button', { name: 'Salvo', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Voltar para biblioteca' }).click()
    await page.getByLabel('Ações de Edited routine').click(); await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click()
    await expect(page.locator('.routine-library-card')).toHaveCount(3)
    const original = cloud.routineRows.find(item => item.name === 'Edited routine')!, copy = cloud.routineRows.find(item => item.name === 'Edited routine — cópia')!
    expect(copy.id).not.toBe(original.id); expect(copy.training_routine_steps.every(step => !original.training_routine_steps.some(old => old.id === step.id))).toBe(true)
    await page.reload(); await expect(page.locator('.routine-library-card')).toHaveCount(3)
    expect(cloud.routineRows.find(item => item.name === 'Edited routine')!.training_routine_steps[0].exercise_id).toBe('tracking')
    expect(await page.evaluate(() => localStorage.getItem('xensi-routine-library:v1'))).toBeNull()
    await page.getByLabel('Ações de Edited routine — cópia').click(); await page.getByRole('menuitem', { name: 'Excluir', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(page.locator('.routine-library-card')).toHaveCount(2)
  })
  test('coordinates presets and routines in one consent dialog, keeps guest on dismissal and imports without duplicates', async ({ page, context }, info) => {
    const cloud = await mockCloud(context); cloud.routineRows.push(row())
    await page.goto('/train/routines'); await seedRoutine(page); await seedGuest(page); await login(page)
    const dialog = page.getByRole('dialog', { name: 'Dados encontrados neste dispositivo' })
    await expect(dialog).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(dialog).toContainText('1 presets, 1 rotinas e 0 sessões.')
    await page.screenshot({ path: info.outputPath('routines-combined-import.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'AGORA NÃO' }).click(); await page.goto('/train/routines'); await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0); expect(cloud.importCalls).toBe(0)
    await page.getByRole('button', { name: 'IMPORTAR ROTINAS', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'IMPORTAR ROTINAS', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.routine-library-card')).toHaveCount(2)
    await page.reload(); await expect(page.locator('.routine-library-card')).toHaveCount(2); expect(cloud.routineRows.filter(item => item.id === routineId)).toHaveLength(1)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('xensi-routine-library:v1')!)[0].id)).toBe(routineId)
  })
  test('response loss after import permits safe retry and failures never display false save success', async ({ page, context }) => {
    const cloud = await mockCloud(context)
    await page.goto('/train/routines'); await seedRoutine(page); await login(page)
    const dialog = page.getByRole('dialog', { name: 'Rotinas encontradas neste dispositivo' }); cloud.loseImportResponse = true
    await dialog.getByRole('button', { name: 'IMPORTAR ROTINAS', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Não foi possível importar as rotinas deste dispositivo.')
    expect(await page.evaluate(id => localStorage.getItem(`xensi-routines:imported:${id}:v1`), userA)).toBeNull()
    await dialog.getByRole('button', { name: 'IMPORTAR ROTINAS', exact: true }).click(); await expect(dialog).not.toBeVisible()
    expect(cloud.routineRows.filter(item => item.id === routineId)).toHaveLength(1)
    await page.goto('/train/routines'); await page.getByLabel('Ações de Guest routine').click(); await page.getByRole('menuitem', { name: 'Editar', exact: true }).click()
    await page.getByLabel('Nome da rotina').fill('Failed edit'); cloud.failWrites = true
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.locator('.routine-playlist-panel').getByRole('alert')).toHaveText('Não foi possível salvar a rotina.')
    await expect(page.getByRole('button', { name: 'Salvo', exact: true })).toHaveCount(0)
    expect(cloud.routineRows[0].name).toBe('Guest routine')
  })
  test('logout and account switching isolate caches, and a second browser fetches the same account', async ({ page, context, browser }) => {
    const cloud = await mockCloud(context); cloud.routineRows.push(row('Account A routine'), { ...row('Account B routine', userB), id: '80000000-0000-4000-8000-000000000001' })
    await login(page); await page.goto('/train/routines'); await expect(page.getByRole('heading', { name: 'Account A routine' })).toBeVisible()
    const second = await browser.newContext({ viewport: page.viewportSize()!, locale: 'pt-BR' })
    try {
      const other = await mockCloud(second); other.routineRows = cloud.routineRows
      const tab = await second.newPage(); await tab.goto('http://127.0.0.1:5175/login'); await login(tab); await tab.goto('/train/routines')
      await expect(tab.getByRole('heading', { name: 'Account A routine' })).toBeVisible()
    } finally { await second.close() }
    await signOut(page); await page.goto('/train/routines'); await expect(page.getByText('Nenhuma rotina salva', { exact: true })).toBeVisible()
    await login(page, 'b@example.invalid'); await page.goto('/train/routines')
    await expect(page.getByRole('heading', { name: 'Account B routine' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Account A routine' })).toHaveCount(0)
  })
  test('removed exercise stays visible, blocks start, and does not discard other steps', async ({ page, context }) => {
    await mockCloud(context); await page.goto('/train/routines')
    await page.evaluate(value => { value.items[0].modeId = 'removed-mode'; localStorage.setItem('xensi-routine-library:v1', JSON.stringify([value])) }, routine)
    await page.reload(); await expect(page.locator('.routine-library-card')).toContainText('Este exercício não está mais disponível.')
    await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeDisabled()
    await page.getByLabel('Ações de Guest routine').click(); await page.getByRole('menuitem', { name: 'Editar', exact: true }).click()
    await expect(page.locator('.routine-builder-item')).toHaveCount(2); await expect(page.getByRole('button', { name: 'Iniciar rotina', exact: true })).toBeDisabled()
  })
  test('imports both collections with one confirmation and does not reoffer after reload', async ({ page, context }, info) => {
    const cloud = await mockCloud(context)
    await page.goto('/train/routines'); await seedRoutine(page); await seedGuest(page); await login(page)
    const dialog = page.getByRole('dialog', { name: 'Dados encontrados neste dispositivo' })
    await expect(dialog).toBeVisible()
    await page.goto('/train/routines'); await expect(dialog).toBeVisible()
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.screenshot({ path: info.outputPath('combined-import-viewport.png') })
    await dialog.getByRole('button', { name: 'IMPORTAR', exact: true }).click(); await expect(dialog).not.toBeVisible()
    expect(cloud.rows).toHaveLength(1); expect(cloud.routineRows).toHaveLength(1)
    await page.reload(); await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.routine-library-card')).toHaveCount(1)
  })
  test('shows explicit cloud loading and never presents guest routines as account data', async ({ page, context }) => {
    const cloud = await mockCloud(context); cloud.routineRows.push(row())
    await page.goto('/train/routines'); await seedRoutine(page); await login(page)
    await page.getByRole('dialog').getByRole('button', { name: 'AGORA NÃO' }).click()
    cloud.delayRoutineFetch = true
    await page.goto('/train/routines')
    await expect(page.getByText('Carregando rotinas...', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Guest routine', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Cloud routine', exact: true })).toBeVisible()
  })
  test('renders English empty state and unavailable exercise without Portuguese fallbacks', async ({ page, context }) => {
    await mockCloud(context); await page.addInitScript(() => localStorage.setItem('sensi-locale', 'en')); await page.goto('/train/routines')
    await expect(page.getByText('No saved routines', { exact: true })).toBeVisible()
    await page.evaluate(value => { value.items[0].modeId = 'removed-mode'; localStorage.setItem('xensi-routine-library:v1', JSON.stringify([value])) }, routine)
    await page.reload(); await expect(page.locator('.routine-library-card')).toContainText('This exercise is no longer available.')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  })
})

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openDiagnostic(page: Page, name: RegExp) {
  await page.getByRole('navigation', { name: 'XENSI' }).getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  await page.getByRole('menuitem', { name }).click()
}

test.describe('Diagnostic tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sensi-locale', 'pt'))
  })

  test('measures browser-observed refresh and invalidates focus loss', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await page.goto('./')
    await openDiagnostic(page, /Refresh Rate/)
    await page.getByRole('button', { name: 'Iniciar teste' }).click()
    await page.clock.runFor(5000)
    await expect(page.getByText('Teste concluído')).toBeVisible()
    await expect(page.getByText('Refresh observado')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Comparação de movimento' })).toBeVisible()
    await expect(page.getByText('Taxa observada', { exact: true })).toBeVisible()
    await expect(page.getByText('Metade da taxa', { exact: true })).toBeVisible()
    await expect(page.getByText('1/4 da taxa', { exact: true })).toBeVisible()
    const target = page.locator('.motion-comparison-target').first()
    await page.clock.runFor(100)
    const beforeMotion = await target.getAttribute('style')
    await page.clock.runFor(500)
    await expect(target).not.toHaveAttribute('style', beforeMotion ?? '')
    await page.getByRole('slider', { name: 'Velocidade' }).fill('1')
    await expect(page.getByText(/não confirma a especificação física do monitor/i)).toBeVisible()

    await page.getByRole('button', { name: 'Testar novamente' }).click()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(page.getByText('Teste interrompido')).toBeVisible()
  })

  test('measures raw controller drift and handles disconnects', async ({ page }) => {
    await page.addInitScript(() => {
      const state = { connected: false, axes: [0.012, -0.008, 0.02, 0.006], startPressed: false, leftStickPressed: false }
      Object.defineProperty(window, '__xensiMockPad', { value: state })
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => state.connected ? [{
          index: 0,
          id: 'XENSI Test Controller',
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: state.axes,
          buttons: Array.from({ length: 17 }, (_, index) => ({
            pressed: index === 0 ? state.startPressed : index === 10 ? state.leftStickPressed : false,
            touched: false,
            value: index === 0 && state.startPressed || index === 10 && state.leftStickPressed ? 1 : 0,
          })),
          vibrationActuator: null,
          hapticActuators: [],
        }] : [],
      })
    })
    await page.clock.install()
    await page.goto('./')
    await openDiagnostic(page, /Drift do Controle/)
    await expect(page.getByText('Nenhum controle detectado')).toBeVisible()
    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { connected: boolean } }).__xensiMockPad.connected = true })
    await page.clock.runFor(100)
    await expect(page.getByText('XENSI Test Controller')).toBeVisible()
    await expect(page.getByText('PRONTO', { exact: true })).toBeVisible()
    await expect(page.getByText('PRESSIONE QUALQUER BOTÃO DO CONTROLE', { exact: true })).toBeVisible()
    await expect(page.getByText('para iniciar a medição', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Iniciar medição' })).toHaveCount(0)

    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { leftStickPressed: boolean } }).__xensiMockPad.leftStickPressed = true })
    await page.clock.runFor(100)
    await expect(page.getByText('PRONTO', { exact: true })).toBeVisible()

    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { leftStickPressed: boolean } }).__xensiMockPad.leftStickPressed = false })
    await page.clock.runFor(100)
    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { startPressed: boolean } }).__xensiMockPad.startPressed = true })
    await page.clock.runFor(20)
    expect(await page.locator('.drift-status strong').textContent()).toContain('Solte completamente os analógicos')
    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { startPressed: boolean } }).__xensiMockPad.startPressed = false })
    await page.clock.runFor(3100)
    expect(await page.locator('.drift-status strong').textContent()).toContain('Não toque nos analógicos.')
    await page.clock.runFor(4100)
    await expect(page.getByText('Medição concluída')).toBeVisible()
    await expect(page.getByText('Deslocamento do centro').first()).toBeVisible()
    await expect(page.getByText(/não confirma defeito físico/i)).toBeVisible()

    await page.getByRole('button', { name: 'Medir novamente' }).click()
    await page.clock.runFor(3100)
    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { axes: number[] } }).__xensiMockPad.axes = [0.6, 0, 0.02, 0.006] })
    await page.clock.runFor(100)
    await expect(page.getByText(/Movimento amplo detectado/i)).toBeVisible()

    await page.getByRole('button', { name: 'Medir novamente' }).click()
    await page.evaluate(() => { (window as unknown as { __xensiMockPad: { connected: boolean } }).__xensiMockPad.connected = false })
    await page.clock.runFor(100)
    await expect(page.getByText('Nenhum controle detectado')).toBeVisible()
  })
})

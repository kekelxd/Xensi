import { expect, test } from '@playwright/test'

const diagnostics = () => ({ name: 'Diagnóstico', exact: true })

test.describe('Diagnostics navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sensi-locale', 'pt'))
    await page.goto('./')
  })

  test('opens the submenu and navigates across all diagnostic views', async ({ page }) => {
    const trigger = page.getByRole('button', diagnostics())
    await expect(trigger).toBeVisible()
    await trigger.click()

    const menu = page.getByRole('menu', { name: 'Diagnóstico' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(4)
    await expect(menu.getByRole('menuitem', { name: /Teste de Polling Rate/ })).toContainText('Meça a frequência observada do mouse.')
    await expect(menu.getByRole('menuitem', { name: /Diagnóstico de Entrada/ })).toContainText('Analise estabilidade e comportamento do input.')
    await expect(menu.getByRole('menuitem', { name: /Refresh Rate/ })).toContainText('Meça a frequência de atualização observada no navegador.')
    await expect(menu.getByRole('menuitem', { name: /Drift do Controle/ })).toContainText('Analise o desvio dos analógicos em repouso.')

    await menu.getByRole('menuitem', { name: /Teste de Polling Rate/ }).click()
    await expect(page.getByRole('heading', { name: /Teste de polling rate/i })).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveURL(/\/diagnostics\/polling-rate$/)

    await trigger.click()
    await expect(page.getByRole('menuitem', { name: /Teste de Polling Rate/ })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('menuitem', { name: /Diagnóstico de Entrada/ }).click()
    await expect(page.getByRole('heading', { name: 'Diagnóstico de entrada', exact: true })).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveURL(/\/diagnostics\/input$/)

    await trigger.click()
    await page.getByRole('menuitem', { name: /Refresh Rate/ }).click()
    await expect(page.getByRole('heading', { name: 'Refresh Rate', exact: true })).toBeVisible()

    await trigger.click()
    await page.getByRole('menuitem', { name: /Drift do Controle/ }).click()
    await expect(page.getByRole('heading', { name: 'Drift do Controle', exact: true })).toBeVisible()
  })

  test('closes with Escape and restores focus to the trigger', async ({ page }) => {
    const trigger = page.getByRole('button', diagnostics())
    await trigger.click()
    await expect(page.getByRole('menu', { name: 'Diagnóstico' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Diagnóstico' })).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('closes when the user clicks outside', async ({ page }) => {
    await page.getByRole('button', diagnostics()).click()
    await page.locator('.xensi-home-v3-section-head').first().click()
    await expect(page.getByRole('menu', { name: 'Diagnóstico' })).toBeHidden()
  })

  test('supports keyboard opening and arrow navigation', async ({ page }) => {
    const trigger = page.getByRole('button', diagnostics())
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const polling = page.getByRole('menuitem', { name: /Teste de Polling Rate/ })
    const input = page.getByRole('menuitem', { name: /Diagnóstico de Entrada/ })
    const refresh = page.getByRole('menuitem', { name: /Refresh Rate/ })
    const drift = page.getByRole('menuitem', { name: /Drift do Controle/ })
    await expect(polling).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(input).toBeFocused()
    await page.keyboard.press('End')
    await expect(drift).toBeFocused()
    await page.keyboard.press('Home')
    await expect(polling).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(drift).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(refresh).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Refresh Rate', exact: true })).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'

async function openProfile(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.locator('.xensi-user-trigger').click()
  await page.getByRole('button', { name: 'Meu perfil', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('xensi-player-profile')
    localStorage.setItem('sensi-locale', 'pt')
    localStorage.setItem('xensi-auth-user-id', 'profile-test-user')
  })
})

test('empty profile, avatar picker and navbar share normalized assets', async ({ page }, testInfo) => {
  await openProfile(page)
  await expect(page.getByText('Nenhuma sensibilidade salva.')).toBeVisible()
  await expect(page.getByText('Membro desde')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Alterar avatar/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar perfil' })).toHaveCount(1)
  await expect(page.locator('.profile-v1-identity-meta')).toHaveCount(0)
  const identityTitle = page.locator('.profile-v1-identity-copy h2')
  const editProfileButton = page.getByRole('button', { name: 'Editar perfil' })
  await expect(identityTitle).toBeVisible()
  expect(await editProfileButton.evaluate((button) => {
    const title = document.querySelector('.profile-v1-identity-copy h2')?.getBoundingClientRect()
    const action = button.getBoundingClientRect()
    return Boolean(title && (action.bottom <= title.top || action.top >= title.bottom || action.right <= title.left || action.left >= title.right))
  })).toBe(true)

  await page.getByRole('button', { name: 'Editar perfil' }).click()
  const avatarButtons = page.locator('.profile-avatar-picker > button')
  await expect(avatarButtons).toHaveCount(21)
  await page.screenshot({ path: testInfo.outputPath('avatar-picker.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cachorro feliz' }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()

  const profileAvatar = page.locator('.profile-v1-person .xensi-avatar img')
  const navbarAvatar = page.locator('.xensi-user-trigger .xensi-avatar img')
  await expect(profileAvatar).toHaveAttribute('src', /(\/Sensi)?\/avatars\/individual\/dog-happy\.png$/)
  await expect(navbarAvatar).toHaveAttribute('src', /(\/Sensi)?\/avatars\/individual\/dog-happy\.png$/)
  await expect.poll(async () => profileAvatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect.poll(async () => navbarAvatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(profileAvatar).toHaveCSS('object-fit', 'contain')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('profile-avatar.png'), fullPage: true })
})

test('creates a preset and prefills converter and calibrator', async ({ page }, testInfo) => {
  await openProfile(page)
  await page.getByRole('button', { name: 'Adicionar sensibilidade' }).click()
  await page.getByRole('dialog', { name: 'Adicionar sensibilidade' }).getByRole('button', { name: 'Counter-Strike 2' }).click()
  await page.getByRole('option', { name: 'Counter-Strike 2' }).click()
  await page.getByRole('textbox', { name: 'Sensibilidade', exact: true }).fill('0.65')
  await page.getByRole('textbox', { name: 'DPI', exact: true }).fill('800')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()

  await expect(page.getByText('79.93 cm/360')).toBeVisible()
  const card = page.locator('.profile-preset-card').first()
  await expect(card.getByText('Principal')).toBeVisible()
  await expect(card.locator('.xensi-game-badge')).toHaveText('CS')
  await page.screenshot({ path: testInfo.outputPath('profile-preset.png'), fullPage: true })

  await card.getByRole('button', { name: /Converter/ }).click()
  await expect(page.getByRole('heading', { name: /Conversor/i })).toBeVisible()
  await expect(page.getByLabel('Sensibilidade atual')).toHaveValue('0.65')
  await expect(page.getByLabel('DPI de origem')).toHaveValue('800')

  await page.locator('.xensi-user-trigger').click()
  await page.getByRole('button', { name: 'Meu perfil', exact: true }).click()
  await page.locator('.profile-preset-card').first().getByRole('button', { name: /Calibrar/ }).click()
  await expect(page.getByRole('heading', { name: /Configure o calibrador/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Counter-Strike 2/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByRole('textbox', { name: 'Sensibilidade', exact: true })).toHaveValue('0.65')
  await expect(page.getByRole('textbox', { name: 'DPI do mouse' })).toHaveValue('800')
})

test('avatar cells remain square and visually contained', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: 'Editar perfil' }).click()
  const cells = page.locator('.profile-avatar-picker > button')
  const count = await cells.count()
  for (let index = 0; index < count; index += 1) {
    const cell = cells.nth(index)
    const box = await cell.boundingBox()
    expect(box).not.toBeNull()
    expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(1)
    await expect(cell.locator('img')).toHaveCSS('object-fit', 'contain')
  }
})

import { expect, type Page } from '@playwright/test'

export async function microTarget(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.warmup-arena')!
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let left = canvas.width, right = 0, top = canvas.height, bottom = 0, count = 0
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (pixels[i] === 255 && pixels[i + 1] === 114 && pixels[i + 2] === 81) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++
      }
    }
    if (count < 100) throw new Error('Visible Micro Flick target missing')
    return { x: (left + right) / 2 * canvas.clientWidth / canvas.width,
      y: (top + bottom) / 2 * canvas.clientHeight / canvas.height,
      width: canvas.clientWidth, height: canvas.clientHeight, pixels: count }
  })
}
export async function microHits(page: Page, count: number, acquisitionMs: number) {
  for (let i = 0; i < count; i++) {
    const aim = await page.locator('canvas.warmup-arena').evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let left = canvas.width, right = 0, top = canvas.height, bottom = 0, count = 0
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const p = (y * canvas.width + x) * 4
        if (pixels[p] === 244 && pixels[p + 1] === 242 && pixels[p + 2] === 235) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++
        }
      }
      if (!count) throw new Error('Visible neutral crosshair missing')
      return { x: (left + right) / 2 * canvas.clientWidth / canvas.width, y: (top + bottom) / 2 * canvas.clientHeight / canvas.height }
    })
    const target = await microTarget(page)
    expect(Math.hypot(target.x - target.width / 2, target.y - target.height / 2)).toBeLessThan(target.height * .3)
    await page.clock.runFor(acquisitionMs)
    await page.evaluate(async ({ target, aim }) => {
      const { getWarmupPointerGain } = await import('/src/warmupConfig.ts')
      const { GAME_BY_ID } = await import('/src/games.ts')
      const gain = getWarmupPointerGain(GAME_BY_ID.cs2, 1)
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: (target.x - aim.x) / gain, movementY: (target.y - aim.y) / gain }))
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    }, { target, aim })
    await page.clock.runFor(250)
  }
}

export async function configureMicro(page: Page) {
  await page.goto('/train')
  await page.getByRole('button', { name: /Micro Flick/ }).click()
  await expect(page).toHaveURL(/\/train\/micro-flick$/)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('textbox', { name: 'Sensibilidade', exact: true }).fill('1')
  await page.getByRole('textbox', { name: 'DPI do mouse' }).fill('800')
  await expect(page.getByRole('button', { name: /Adaptativa/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Continuar/ }).click()
}

export async function startMicro(page: Page) {
  await page.getByRole('button', { name: /Iniciar aquecimento/ }).click()
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await expect(page.locator('.warmup-countdown')).toBeVisible()
  await page.clock.runFor(3100)
  await expect(page.locator('.warmup-countdown')).toHaveCount(0)
}

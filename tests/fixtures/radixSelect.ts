import type { Page } from '@playwright/test'

/** Opens a Radix Select by its accessible name and picks the item carrying data-value. */
export async function pickSelect(page: Page, name: string, value: string) {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.locator(`[role="option"][data-value="${value}"]`).click()
}

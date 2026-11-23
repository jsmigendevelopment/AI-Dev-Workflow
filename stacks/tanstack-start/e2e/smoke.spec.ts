import { expect, test } from './gate'

test('the home page loads', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open notes' })).toBeVisible()
  expect(errors).toEqual([])
})

test('notes are refused without a session', async ({ page }) => {
  await page.goto('/notes')
  // The server function answered `unauthenticated`, so the view asks the visitor to sign in.
  await expect(page.getByText('Sign in to see your notes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0)
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { E2E_PASSWORD, hydrated } from './helpers'

// The password gate (setup-cloudflare --protect password), on a local preview of the same build
// with SITE_PROTECTION=password (the `password` project in playwright.config.ts). Never deployed:
// the deployed test site is checked by the other specs, which send the password as a header.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

// One rate limiter for the whole file: in order, with the lock-out last.
test.describe.configure({ mode: 'serial' })

test('a page asks for the password: 401, noindex, a labelled field, no app code', async ({ page }) => {
  const response = await page.goto('/notes')
  expect(response!.status()).toBe(401)
  expect(response!.headers()['x-robots-tag']).toBe('noindex')
  await expect(page.getByRole('heading', { level: 1, name: 'Password needed' })).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
  await expect(page.locator('script')).toHaveCount(0)
})

test('server functions and /api/v1 are refused without it; the header opens them', async ({ request }) => {
  const refused = await request.get('/api/v1/notes')
  expect(refused.status()).toBe(403)
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('forbidden')
  expect((await request.post('/_serverFn/x', { data: {} })).status()).toBe(403)
  const open = await request.get('/api/v1/notes', { headers: { 'x-site-password': E2E_PASSWORD } })
  expect(open.status()).toBe(401) // past the gate: now the API's own bearer check
  const bearer = await request.get('/', { headers: { authorization: `Bearer ${E2E_PASSWORD}` } })
  expect(bearer.status()).toBe(401)
  expect(await bearer.text()).toContain('Password needed')
})

for (const theme of ['light', 'dark'] as const)
  test(`the password page, empty and with an error, has no axe violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([])
    await page.getByLabel('Password').fill('not it')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toHaveText('That password is not right.')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Password')).toHaveAccessibleDescription('That password is not right.')
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([])
  })

test('the right password sets a session cookie and returns to the page asked for', async ({
  page,
  context,
}) => {
  await page.goto('/notes')
  await page.getByLabel('Password').fill(E2E_PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/notes$/)
  await hydrated(page)
  await expect(page.getByText('Sign in to see your notes')).toBeVisible()
  const cookie = (await context.cookies()).find((c) => c.name === '__Host-site-pass')!
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
  expect(cookie.expires).toBe(-1) // a session cookie
  expect(cookie.value).not.toContain(E2E_PASSWORD)
})

test('wrong answers are rate-limited', async ({ request }) => {
  let last = 0
  for (let i = 0; i < 12 && last !== 429; i++)
    last = (await request.get('/', { headers: { 'x-site-password': `wrong-${i}` } })).status()
  expect(last).toBe(429)
})

import { expect, test } from '@playwright/test'

import { API_LOOKALIKES, E2E_ACCESS, expectGuard404, RESOLVED_ELSEWHERE } from './helpers'

// The Worker's Cloudflare Access JWT check (src/lib/access-jwt.ts), on a local preview of the
// same build with SITE_PROTECTION=access and ACCESS_PATHS set (the `access` project in
// playwright.config.ts). No real Access is in front, so a protected path refuses every request:
// that proves the check is wired and fails closed. Valid, expired and wrong-audience tokens are
// in the unit tests, which sign their own.
const REFUSED = {
  ok: false,
  error: { code: 'unauthenticated', message: 'Sign in through Cloudflare Access to continue.' },
}

test('a protected page, /api/v1 and server functions answer the 401 envelope with no token', async ({
  request,
}) => {
  for (const [method, path] of [
    ['GET', '/notes'],
    ['GET', '/api/v1/notes'],
    ['POST', '/_serverFn/x'],
  ] as const) {
    const response = await request.fetch(path, { method, data: method === 'POST' ? {} : undefined })
    expect(response.status(), path).toBe(401)
    expect(response.headers()['www-authenticate']).toBe('Cloudflare-Access realm="site"')
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(await response.json()).toEqual(REFUSED)
  }
})

test('a look-alike of a protected path is a 404 or the same 401', async ({ request }) => {
  for (const path of ['/NOTES', '/Notes', '/%6Eotes', ...API_LOOKALIKES]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect([404, 401], path).toContain(response.status())
    if (response.status() === 401) expect(await response.json(), path).toEqual(REFUSED)
  }
})

for (const path of RESOLVED_ELSEWHERE) {
  test(`${path} is the guards' plain 404`, async ({ request, baseURL }) => {
    await expectGuard404(request, baseURL!, path)
  })
}

test('a forged or unsigned token is refused the same way', async ({ request }) => {
  const forged = await request.get('/notes', { headers: { 'cf-access-jwt-assertion': 'not-a-jwt' } })
  expect(forged.status()).toBe(401)
  expect(await forged.json()).toEqual(REFUSED)
  const unsigned = await request.get('/notes', {
    headers: { 'cf-access-jwt-assertion': 'eyJhbGciOiJub25lIn0.eyJhdWQiOiJ4In0.' },
  })
  expect(unsigned.status()).toBe(401)
})

test('paths outside ACCESS_PATHS are unaffected', async ({ page }) => {
  expect(E2E_ACCESS.ACCESS_PATHS.split(',')).not.toContain('/')
  const response = await page.goto('/')
  expect(response!.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

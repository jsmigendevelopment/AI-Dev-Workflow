import { expect, test } from '@playwright/test'

import { bearer, sessionCookie, sessionToken, signedInAs, UNSIGNED } from './clerk-tokens'
import { API_LOOKALIKES } from './helpers'

// Clerk's authorizedParties (src/lib/authorized-parties.ts), end to end through clerkMiddleware,
// on a local preview with a made-up Clerk instance (the `clerk` project in playwright.config.ts).
// A local build allows its own loopback origin, so a token is good only when its `azp` is
// exactly this preview's origin. Preview hosts and SITE_URL are in the unit tests.
const UNAUTHENTICATED = { ok: false, error: { code: 'unauthenticated', message: 'Sign in to continue.' } }

const WRONG = {
  'a wrong origin': 'https://evil.example',
  'a look-alike host': 'http://localhost:4177.evil.example',
  'another local port': 'http://localhost:4178',
  'the right host over https': 'https://localhost:4177',
  'a trailing slash': 'http://localhost:4177/',
  'a missing azp (Clerk refuses it once authorizedParties is set)': undefined,
} as const

test('bearer: a token for this origin signs in', async ({ request, baseURL }) => {
  const response = await bearer(request, new URL(baseURL!).origin)
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, data: { items: [] } })
})

test('cookie: a session for this origin signs in', async ({ request, baseURL }) => {
  expect(await signedInAs(request, new URL(baseURL!).origin)).toBe('"user_e2e"')
})

test('a valid session cookie never signs in to the API, whatever the Authorization header says', async ({
  request,
  baseURL,
}) => {
  const cookie = await sessionCookie(new URL(baseURL!).origin)
  // Clerk reads only the exact `Bearer <token>`; for anything else it would fall back to the cookie.
  for (const authorization of [undefined, 'bearer junk', 'BEARER junk', 'Bearer', `bearer ${UNSIGNED}`]) {
    const response = await request.get('/api/v1/notes', {
      headers: { cookie, ...(authorization ? { authorization } : {}) },
    })
    expect(response.status(), authorization ?? 'no header').toBe(401)
  }
  expect((await request.get('/', { headers: { cookie } })).status()).toBe(200)
})

test('a look-alike API path is a 404, or Clerk never sees the session cookie there', async ({
  request,
  baseURL,
}) => {
  const cookie = await sessionCookie(new URL(baseURL!).origin)
  const none = await request.get('/api/v1/notes')
  for (const path of API_LOOKALIKES) {
    const response = await request.get(path, { headers: { cookie }, maxRedirects: 0 })
    expect([404, 401], path).toContain(response.status())
    if (response.status() === 401)
      expect(response.headers()['x-clerk-auth-status'], path).toBe(none.headers()['x-clerk-auth-status'])
  }
})

test('bearer: a spoofed X-Forwarded-Host never makes its origin a party', async ({ request }) => {
  const { token } = await sessionToken('http://localhost:4178')
  const response = await request.get('/api/v1/notes', {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-host': 'localhost:4178' },
  })
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual(UNAUTHENTICATED)
})

test('bearer: a native token (no azp) is refused while CLERK_ALLOW_NATIVE_TOKENS is off', async ({
  request,
}) => {
  const response = await bearer(request, undefined)
  expect(response.status()).toBe(401)
})

for (const [name, azp] of Object.entries(WRONG)) {
  test(`bearer: ${name} is the same 401 as no token`, async ({ request }) => {
    const none = await request.get('/api/v1/notes')
    const response = await bearer(request, azp)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual(UNAUTHENTICATED)
    expect(response.headers()['www-authenticate']).toBe('Bearer')
    for (const header of ['x-clerk-auth-reason', 'x-clerk-auth-message'])
      expect(response.headers()[header], header).toBeUndefined()
    expect(response.headers()['x-clerk-auth-status']).toBe(none.headers()['x-clerk-auth-status'])
  })

  test(`cookie: ${name} is signed out, with no reason given`, async ({ request }) => {
    expect(await signedInAs(request, azp)).toBe('null')
  })
}

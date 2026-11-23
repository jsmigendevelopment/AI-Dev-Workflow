import { expect, test } from '@playwright/test'

import { bearer, E2E_APP, sessionCookie, sessionToken, signedInAs, UNSIGNED } from './clerk-tokens'
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

// requestForClerk (src/lib/authorized-parties.ts): Clerk is handed the API request without
// `Cookie`. Our 401 alone can't show that (bearerActor refuses any header but an exact Bearer),
// so this reads what Clerk decided: with the cookie it would say signed-in.
test('a valid session cookie plus a bare or inexact bearer token is a 401, and Clerk never saw the cookie', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin
  const cookie = await sessionCookie(origin)
  const { token } = await sessionToken(origin)
  // A bare value is Clerk's header token (a junk one is signed out); the rest make Clerk fall back to the cookie.
  for (const authorization of [token, UNSIGNED, undefined, `bearer ${token}`, `Bearer  ${token}`, 'Bearer']) {
    const response = await request.get('/api/v1/notes', {
      headers: { cookie, ...(authorization === undefined ? {} : { authorization }) },
    })
    const label = authorization === token ? 'bare token' : (authorization?.slice(0, 9) ?? 'no header')
    expect(response.status(), label).toBe(401)
    expect(await response.json(), label).toEqual(UNAUTHENTICATED)
    if (authorization !== token) expect(response.headers()['x-clerk-auth-status'], label).toBe('signed-out')
  }
})

// Clerk reads its own `__clerk*` query parameters even on an API call: a junk handshake made a
// development instance throw (a 500), and `__clerk_redirect_url`, `__clerk_db_jwt` and
// `__clerk_synced` started a redirect. requestForClerk drops them all, and any redirect Clerk
// still answers with on /api/v1 becomes the uniform 401.
const CLERK_QUERIES = [
  '__clerk_handshake=junk',
  '__clerk_handshake=a.b.c',
  '__clerk_handshake_nonce=junk',
  '__clerk_redirect_url=https%3A%2F%2Fevil.example%2Fx',
  '__clerk_db_jwt=dvb_e2e',
  '__clerk_synced=false',
  '__clerk_synced=true',
  '__clerk_status=x',
  '__clerk_help=1',
]

test('every __clerk query parameter on /api/v1 is the uniform 401, never a redirect or a 500', async ({
  request,
}) => {
  for (const query of CLERK_QUERIES)
    for (const headers of [{}, { 'sec-fetch-dest': 'document', accept: 'text/html' }] as Record<
      string,
      string
    >[]) {
      const label = `${query} ${Object.keys(headers).length ? 'document' : 'fetch'}`
      const response = await request.get(`/api/v1/notes?${query}`, { headers, maxRedirects: 0 })
      expect(response.status(), label).toBe(401)
      expect(response.headers()['location'], label).toBeUndefined()
      expect(await response.json(), label).toEqual(UNAUTHENTICATED)
    }
})

test('normal query parameters still reach the API route', async ({ request, baseURL }) => {
  const { token } = await sessionToken(new URL(baseURL!).origin)
  const headers = { authorization: `Bearer ${token}` }
  expect((await request.get('/api/v1/notes?limit=5', { headers })).status()).toBe(200)
  // The route reads the original query: a bad value is its own 400, not swallowed.
  expect((await request.get('/api/v1/notes?limit=0', { headers })).status()).toBe(400)
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
  // This preview sets CLERK_NATIVE_APP_CLAIM too: the flag alone keeps the native path off.
  for (const claims of [{}, { app: E2E_APP }]) {
    const response = await bearer(request, undefined, claims)
    expect(response.status(), JSON.stringify(claims)).toBe(401)
  }
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

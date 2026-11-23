import { type APIRequestContext, expect, test } from '@playwright/test'

import { sessionToken } from './clerk-tokens'

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

const bearer = async (request: APIRequestContext, azp: string | undefined) => {
  const { token } = await sessionToken(azp)
  return request.get('/api/v1/notes', { headers: { authorization: `Bearer ${token}` } })
}

// The session cookie as Clerk's browser SDK sets it on a development instance. The page's
// server-rendered Clerk state says who Clerk let in.
const signedInAs = async (request: APIRequestContext, azp: string | undefined) => {
  const { token, iat } = await sessionToken(azp)
  const cookie = `__session=${token}; __client_uat=${iat}; __clerk_db_jwt=dvb_e2e`
  const response = await request.get('/', { headers: { cookie } })
  expect(response.status()).toBe(200)
  for (const header of ['x-clerk-auth-reason', 'x-clerk-auth-message'])
    expect(response.headers()[header], header).toBeUndefined()
  return /"userId":(null|"[^"]*")/.exec(await response.text())?.[1]
}

test('bearer: a token for this origin signs in', async ({ request, baseURL }) => {
  const response = await bearer(request, new URL(baseURL!).origin)
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, data: { items: [] } })
})

test('cookie: a session for this origin signs in', async ({ request, baseURL }) => {
  expect(await signedInAs(request, new URL(baseURL!).origin)).toBe('"user_e2e"')
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

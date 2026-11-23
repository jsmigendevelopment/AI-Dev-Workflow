import { expect, test } from '@playwright/test'

import { bearer, sessionCookie, sessionToken, signedInAs, UNSIGNED } from './clerk-tokens'

// The same made-up Clerk instance with CLERK_ALLOW_NATIVE_TOKENS=true (the `clerk-native`
// project): a native app's bearer token has no `azp` and gets through on /api/v1. Nothing else
// is relaxed: the cookie still needs `azp`, and a token that names the wrong origin is refused.
test('bearer: a token with no azp signs in to /api/v1', async ({ request }) => {
  const response = await bearer(request, undefined)
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, data: { items: [] } })
})

test('bearer: a token for the wrong origin is still refused', async ({ request }) => {
  for (const azp of ['https://evil.example', ''] as const) {
    const response = await bearer(request, azp)
    expect(response.status(), azp).toBe(401)
  }
})

test('cookie: a session with no azp is still signed out', async ({ request }) => {
  expect(await signedInAs(request, undefined)).toBe('null')
})

test('cookie: a session for this origin still signs in', async ({ request, baseURL }) => {
  expect(await signedInAs(request, new URL(baseURL!).origin)).toBe('"user_e2e"')
})

test('a lowercase bearer with no azp plus another site’s session cookie is refused', async ({ request }) => {
  const cookie = await sessionCookie('https://evil.example')
  for (const authorization of [`bearer ${UNSIGNED}`, `BEARER ${UNSIGNED}`, `Bearer  ${UNSIGNED}`]) {
    const response = await request.get('/api/v1/notes', { headers: { authorization, cookie } })
    expect(response.status(), authorization.split(' ')[0]).toBe(401)
  }
})

test('an exact Bearer with no azp is refused while a Clerk session cookie is there', async ({ request }) => {
  const { token } = await sessionToken(undefined)
  for (const cookie of ['__session=x', '__client_uat=0', await sessionCookie('https://evil.example')]) {
    const response = await request.get('/api/v1/notes', {
      headers: { authorization: `Bearer ${token}`, cookie },
    })
    expect(response.status(), cookie.slice(0, 14)).toBe(401)
  }
})

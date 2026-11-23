import { expect, test } from '@playwright/test'

import { bearer, E2E_APP, sessionCookie, sessionToken, signedInAs, UNSIGNED } from './clerk-tokens'

// The same made-up Clerk instance with CLERK_ALLOW_NATIVE_TOKENS=true and CLERK_NATIVE_APP_CLAIM
// (the `clerk-native` project): a native app's bearer token has no `azp` and gets through on
// /api/v1 only with our `app` claim. Nothing else is relaxed: the cookie still needs `azp`, and a
// token that names the wrong origin is refused.
const app = { app: E2E_APP }

test('bearer: a token with no azp and our app claim signs in to /api/v1', async ({ request }) => {
  const response = await bearer(request, undefined, app)
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, data: { items: [] } })
})

test('bearer: a token with no azp and no app claim, a wrong one or a non-string one is the uniform 401', async ({
  request,
}) => {
  const none = await request.get('/api/v1/notes')
  for (const claims of [{}, { app: 'other-app' }, { app: [E2E_APP] }, { app: 1 }, { app: null }]) {
    const response = await bearer(request, undefined, claims)
    expect(response.status(), JSON.stringify(claims)).toBe(401)
    expect(await response.json()).toEqual(await none.json())
    for (const header of ['x-clerk-auth-reason', 'x-clerk-auth-message'])
      expect(response.headers()[header], header).toBeUndefined()
  }
})

test('bearer: a token for the wrong origin is still refused', async ({ request }) => {
  for (const azp of ['https://evil.example', ''] as const) {
    const response = await bearer(request, azp, app)
    expect(response.status(), azp).toBe(401)
  }
})

test('cookie: a session with no azp is still signed out, our app claim or not', async ({ request }) => {
  expect(await signedInAs(request, undefined)).toBe('null')
  expect(await signedInAs(request, undefined, app)).toBe('null')
})

test('cookie: a session for this origin still signs in', async ({ request, baseURL }) => {
  expect(await signedInAs(request, new URL(baseURL!).origin)).toBe('"user_e2e"')
})

test('a lowercase bearer with no azp plus another site’s session cookie is refused', async ({ request }) => {
  const cookie = await sessionCookie('https://evil.example', app)
  for (const authorization of [`bearer ${UNSIGNED}`, `BEARER ${UNSIGNED}`, `Bearer  ${UNSIGNED}`]) {
    const response = await request.get('/api/v1/notes', { headers: { authorization, cookie } })
    expect(response.status(), authorization.split(' ')[0]).toBe(401)
  }
})

test('an exact Bearer with no azp and our app claim is refused while a Clerk session cookie is there', async ({
  request,
}) => {
  const { token } = await sessionToken(undefined, app)
  for (const cookie of ['__session=x', '__client_uat=0', await sessionCookie('https://evil.example', app)]) {
    const response = await request.get('/api/v1/notes', {
      headers: { authorization: `Bearer ${token}`, cookie },
    })
    expect(response.status(), cookie.slice(0, 14)).toBe(401)
  }
})

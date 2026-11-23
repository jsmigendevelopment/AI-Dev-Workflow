import { expect, test } from '@playwright/test'

import { bearer, signedInAs } from './clerk-tokens'

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

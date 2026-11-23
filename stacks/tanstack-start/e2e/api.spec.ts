import { expect, gateHeaders, test } from './gate'

// The /api/v1 HTTP API, from outside: it fails closed without a valid bearer token, and the
// request guards cover it like server functions. Also runs against deployed URLs (test:deployed).
const ID = '00000000-0000-4000-8000-000000000001'
const CALLS = [
  ['GET', '/api/v1/notes'],
  ['POST', '/api/v1/notes'],
  ['PATCH', `/api/v1/notes/${ID}`],
  ['DELETE', `/api/v1/notes/${ID}`],
] as const

const UNAUTHENTICATED = { ok: false, error: { code: 'unauthenticated', message: 'Sign in to continue.' } }

for (const [method, path] of CALLS) {
  test(`${method} ${path} is 401 without a bearer token`, async ({ request }) => {
    const response = await request.fetch(path, {
      method,
      ...(method === 'POST' || method === 'PATCH' ? { data: { title: 'Hi' } } : {}),
    })
    expect(response.status()).toBe(401)
    expect(response.headers()['www-authenticate']).toBe('Bearer')
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(await response.json()).toEqual(UNAUTHENTICATED)
  })
}

test('other methods get 405 with Allow, never the HTML shell', async ({ request }) => {
  const list = await request.fetch('/api/v1/notes', { method: 'PUT' })
  expect(list.status()).toBe(405)
  expect(list.headers()['allow']).toBe('GET, POST')
  const one = await request.fetch(`/api/v1/notes/${ID}`, { method: 'GET' })
  expect(one.status()).toBe(405)
  expect(one.headers()['content-type']).toContain('application/json')
})

test('a token that is not a valid Clerk session token is 401', async ({ request }) => {
  const forged = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ1c2VyX2JvYiJ9', 'c2lnbmF0dXJl'].join('.')
  for (const authorization of [`Bearer ${forged}`, 'Bearer not-a-jwt', 'Basic dXNlcjpwYXNz']) {
    const response = await request.get('/api/v1/notes', { headers: { authorization } })
    expect(response.status(), authorization).toBe(401)
    expect(await response.json()).toEqual(UNAUTHENTICATED)
  }
})

test('the session cookie alone never signs in to the API', async ({ request }) => {
  const cookie = '__session=eyJhbGciOiJSUzI1NiJ9.e30.c2ln; __client_uat=1700000000'
  // Nor with a header Clerk ignores (it would read the cookie). With real keys and a valid
  // cookie: e2e/clerk-parties.spec.ts.
  for (const authorization of [undefined, 'bearer junk', 'BEARER junk', 'Bearer']) {
    const response = await request.get('/api/v1/notes', {
      headers: { cookie, ...(authorization ? { authorization } : {}) },
    })
    expect(response.status(), authorization ?? 'no header').toBe(401)
  }
})

test('API bodies are capped before anything reads them, auth included', async ({ baseURL }) => {
  const big = await fetch(`${baseURL}/api/v1/notes`, {
    method: 'POST',
    headers: { ...gateHeaders(), 'content-type': 'application/json', authorization: 'Bearer x' },
    body: JSON.stringify({ title: 'x'.repeat(65 * 1024) }),
  })
  expect(big.status).toBe(413)
  expect(await big.json()).toEqual({
    ok: false,
    error: { code: 'too_large', message: 'That request is too large.' },
  })
})

test('the API is rate-limited per client, with the safe envelope', async ({ baseURL }) => {
  // Locally the limiter trusts this header (see security.spec.ts); a deployed edge sets it itself.
  test.skip(!!process.env.BASE_URL, 'needs a client address of its own')
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`
  const call = () =>
    fetch(`${baseURL}/api/v1/notes`, { headers: { ...gateHeaders(), 'cf-connecting-ip': ip } })
  const statuses: number[] = []
  for (let i = 0; i < 21; i++)
    statuses.push(...(await Promise.all(Array.from({ length: 10 }, call))).map((r) => r.status))
  expect(statuses).toContain(401)
  expect(statuses).toContain(429)
  const limited = await call()
  expect(limited.status).toBe(429)
  expect(limited.headers.get('retry-after')).toBe('60')
  expect(await limited.json()).toMatchObject({ ok: false, error: { code: 'rate_limited' } })
})

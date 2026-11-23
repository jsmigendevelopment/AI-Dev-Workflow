import { type APIResponse, expect, test } from '@playwright/test'

import { handshakeToken, sessionCookie, sessionToken } from './clerk-tokens'

// Clerk's redirects on a development instance (#66), end to end on the `clerk` preview. Without
// the guard, `/notes?__clerk_redirect_url=https://evil.example` was a 307 to
// `https://evil.example/?__clerk_db_jwt=<the visitor's dev browser token>&__clerk_synced=true`.
const FAPI = 'https://e2e-only.clerk.accounts.dev'
const DEV_TOKEN = 'dvb_e2e'
const DOCUMENT = { 'sec-fetch-dest': 'document', accept: 'text/html' }
const enc = encodeURIComponent

const foreignTargets = (own: URL) => [
  'https://evil.example/x',
  `http://${own.hostname}:${Number(own.port) + 1}/x`,
  `http://${own.host}.evil.example/x`,
  `http://${own.host}@evil.example/x`,
  `https://${own.host}/x`,
  '//evil.example/x',
  'not-a-url',
]

const PATHS = ['/', '/notes', '/notes/n_missing', '/robots.txt', '/_serverFn/x']

/** Fails when a response redirects off this site and Clerk's Frontend API, or leaks the token. */
function expectNoForeignRedirect(response: APIResponse, own: URL, label: string) {
  const location = response.headers()['location']
  if (location === undefined) return
  const origin = new URL(location, own).origin
  const allowed = [own.origin, FAPI].includes(origin)
  if (!allowed) expect(location, `${label}: the dev browser token went to ${origin}`).not.toContain(DEV_TOKEN)
  expect(allowed, `${label}: redirected to ${location}`).toBe(true)
}

test('a foreign Clerk redirect target is a 400 on every path, never a redirect to another origin', async ({
  request,
  baseURL,
}) => {
  const own = new URL(baseURL!)
  const cookies = [`__clerk_db_jwt=${DEV_TOKEN}`, await sessionCookie(own.origin)]
  for (const name of ['__clerk_redirect_url', '__clerk_satellite_url', '%5F%5Fclerk_redirect_url'])
    for (const target of foreignTargets(own))
      for (const path of PATHS)
        for (const cookie of cookies) {
          const label = `${path} ${name}=${target} ${cookie.slice(0, 9)}`
          const response = await request.get(`${path}?${name}=${enc(target)}`, {
            headers: { ...DOCUMENT, cookie },
            maxRedirects: 0,
          })
          expectNoForeignRedirect(response, own, label)
          expect(response.status(), label).toBe(400)
          expect(await response.text(), label).not.toContain(DEV_TOKEN)
        }
})

test('a target on an authorized party after a foreign one is still a 400', async ({ request, baseURL }) => {
  const own = new URL(baseURL!)
  const query = `__clerk_redirect_url=${enc(`${own.origin}/back`)}&__clerk_redirect_url=${enc('https://evil.example/')}`
  const response = await request.get(`/notes?${query}`, {
    headers: { ...DOCUMENT, cookie: `__clerk_db_jwt=${DEV_TOKEN}` },
    maxRedirects: 0,
  })
  expectNoForeignRedirect(response, own, query)
  expect(response.status()).toBe(400)
})

// Clerk built a handshake return's Location from `X-Forwarded-Host`: a 307 to that host.
// requestForClerk drops the proxy headers, so it returns to this site. (authMiddleware's
// Location check stays behind it; the unit tests cover that layer.)
test('a handshake return with a spoofed X-Forwarded-Host comes back to this site', async ({
  request,
  baseURL,
}) => {
  const own = new URL(baseURL!)
  const { token, iat } = await sessionToken(own.origin)
  const handshake = await handshakeToken([`__session=${token}; Path=/`, `__client_uat=${iat}; Path=/`])
  for (const path of ['/', `/notes?__clerk_handshake=${handshake}`]) {
    const response = await request.get(path, {
      headers: {
        ...DOCUMENT,
        'x-forwarded-host': 'evil.example',
        cookie: `__clerk_db_jwt=${DEV_TOKEN}; __clerk_handshake=${handshake}`,
      },
      maxRedirects: 0,
    })
    expectNoForeignRedirect(response, own, path)
    expect(response.status(), path).toBe(307)
    expect(new URL(response.headers()['location']!).origin, path).toBe(own.origin)
  }
})

// Clerk built its handshake's `redirect_url` from `X-Forwarded-Host` too, so the 307 to Clerk's
// Frontend API named the spoofed host (with `__session` in the URL on a dev-browser sync).
// requestForClerk drops the proxy headers: the handshake returns to this site.
test('spoofed proxy headers never put another host in a Clerk handshake', async ({ request, baseURL }) => {
  const own = new URL(baseURL!)
  const spoofs: Record<string, string>[] = [
    { 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    { forwarded: 'host=evil.example;proto=https' },
  ]
  const visits: [string, Record<string, string>][] = [
    ['/notes', {}],
    ['/notes?__clerk_db_jwt=x', { cookie: await sessionCookie(own.origin) }],
  ]
  for (const spoof of spoofs)
    for (const [path, extra] of visits) {
      const label = `${path} ${JSON.stringify(spoof)}`
      const response = await request.get(path, {
        headers: { ...DOCUMENT, ...extra, ...spoof },
        maxRedirects: 0,
      })
      const location = response.headers()['location'] ?? ''
      expect(location, label).not.toContain('evil.example')
      expect(response.status(), label).toBe(307)
      const handshake = new URL(location)
      expect(handshake.origin, label).toBe(FAPI)
      // The host only: the local preview itself takes the scheme of `request.url` from
      // X-Forwarded-Proto (@cloudflare/vite-plugin); a deployed Worker's URL comes from the edge.
      expect(new URL(handshake.searchParams.get('redirect_url')!).host, label).toBe(own.host)
    }
})

// The legitimate development flow, as @clerk/backend 3.31.4 runs it (authenticateRequestWithTokenInCookie
// and HandshakeService), with Clerk's Frontend API played by the test.
test.describe('the development sign-in and sync flow still works', () => {
  test('a first visit with no dev browser goes to Clerk’s handshake, returning to this site', async ({
    request,
    baseURL,
  }) => {
    const own = new URL(baseURL!)
    const response = await request.get('/notes', { headers: DOCUMENT, maxRedirects: 0 })
    expect(response.status()).toBe(307)
    const location = new URL(response.headers()['location']!)
    expect(location.origin).toBe(FAPI)
    expect(location.pathname).toBe('/v1/client/handshake')
    expect(location.searchParams.get('redirect_url')).toBe(`${own.origin}/notes`)
    expect(location.searchParams.get('__clerk_hs_reason')).toBe('dev-browser-missing')
  })

  test('the handshake return sets the session and redirects to the same page, then signs in', async ({
    request,
    baseURL,
  }) => {
    const own = new URL(baseURL!)
    const { token, iat } = await sessionToken(own.origin)
    const directives = [
      `__session=${token}; Path=/`,
      `__client_uat=${iat}; Path=/`,
      `__clerk_db_jwt=${DEV_TOKEN}; Path=/`,
    ]
    const back = await request.get(`/notes?q=a&__clerk_handshake=${await handshakeToken(directives)}`, {
      headers: DOCUMENT,
      maxRedirects: 0,
    })
    expect(back.status()).toBe(307)
    expect(back.headers()['location']).toBe(`${own.origin}/notes?q=a`)
    const set = back.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')
    expect(set.map((h) => h.value.split('=')[0])).toEqual(
      expect.arrayContaining(['__session', '__client_uat']),
    )
    const page = await request.get('/notes?q=a', {
      headers: {
        ...DOCUMENT,
        cookie: `__session=${token}; __client_uat=${iat}; __clerk_db_jwt=${DEV_TOKEN}`,
      },
    })
    expect(page.status()).toBe(200)
    expect(await page.text()).toContain('"userId":"user_e2e"')
  })

  test('a sync request for an authorized party is answered with the token and __clerk_synced', async ({
    request,
    baseURL,
  }) => {
    const own = new URL(baseURL!)
    const target = `${own.origin}/notes?from=satellite`
    const response = await request.get(`/?__clerk_redirect_url=${enc(target)}`, {
      headers: { ...DOCUMENT, cookie: await sessionCookie(own.origin) },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(307)
    const location = new URL(response.headers()['location']!)
    expect(location.origin + location.pathname).toBe(`${own.origin}/notes`)
    expect(location.searchParams.get('__clerk_db_jwt')).toBe(DEV_TOKEN)
    expect(location.searchParams.get('__clerk_synced')).toBe('true')
  })

  test('the __clerk_synced return renders the page signed in', async ({ request, baseURL }) => {
    const own = new URL(baseURL!)
    const response = await request.get('/notes?from=satellite&__clerk_synced=true', {
      headers: { ...DOCUMENT, cookie: await sessionCookie(own.origin) },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('"userId":"user_e2e"')
  })
})

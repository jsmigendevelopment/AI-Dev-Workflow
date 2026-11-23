import { expect, test } from '@playwright/test'

import { hydrated, recordCspViolations, ROUTES, watchProblems } from './helpers'

const BASELINE = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'cross-origin-opener-policy': 'same-origin',
}

test('pages, 404s, server functions and static files all carry the security headers', async ({ request }) => {
  const asset = /\/assets\/[^"]+\.js/.exec(await (await request.get('/')).text())![0]
  for (const path of ['/', '/notes', '/nope', '/robots.txt', asset, '/_serverFn/x']) {
    const headers = (await request.get(path)).headers()
    expect(headers, path).toMatchObject(BASELINE)
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    // localhost stays indexable (Lighthouse reads this header); previews get noindex.
    expect(headers['x-robots-tag'], path).toBeUndefined()
  }
})

test('HTML gets a strict CSP whose nonce matches every inline script, fresh per response', async ({
  request,
}) => {
  const first = await request.get('/')
  const csp = first.headers()['content-security-policy']!
  const nonce = /'nonce-([^']+)'/.exec(csp)![1]!
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'(;|$)/)
  expect(csp).not.toMatch(/script-src[^;]*unsafe/)
  const html = await first.text()
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  expect(scripts.length).toBeGreaterThan(2)
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`)
  const second = (await request.get('/')).headers()['content-security-policy']!
  expect(second).not.toContain(nonce)
})

for (const path of ROUTES) {
  test(`${path} runs with zero CSP violations and zero console errors`, async ({ page }) => {
    await recordCspViolations(page)
    const problems = watchProblems(page)
    await page.goto(path)
    await hydrated(page)
    // The theme toggle runs the inline script's handler: it must be allowed too.
    await page.getByRole('button', { name: 'Switch between light and dark theme' }).click()
    // 404 is the page's own status, not an error worth failing on.
    await problems.expectNone().catch((e: Error) => {
      if (path.includes('does-not-exist') && /404/.test(e.message) && !/csp:/.test(e.message)) return
      throw e
    })
  })
}

test('hashed assets are cached for a year, HTML is revalidated and never shared', async ({ request }) => {
  const page = await request.get('/')
  expect(page.headers()['cache-control']).toBe('private, no-cache')
  const asset = /\/assets\/[^"]+\.(js|css)/.exec(await page.text())![0]
  expect((await request.get(asset)).headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})

test('scanner paths get a plain 404 without a page render', async ({ request }) => {
  for (const path of ['/wp-login.php', '/.env', '/.git/config']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(await response.text()).toBe('Not found\n')
  }
  const unknown = await request.get('/no-such-page')
  expect(unknown.status()).toBe(404)
  expect(unknown.headers()['content-type']).toContain('text/html')
})

test('a cross-site call to a server function is blocked', async ({ request }) => {
  const response = await request.post('/_serverFn/anything', {
    headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    data: {},
  })
  expect(response.status()).toBe(403)
})

test('bodies are bounded before anything reads them', async ({ baseURL }) => {
  const sameSite = { 'sec-fetch-site': 'same-origin', origin: baseURL!, 'content-type': 'application/json' }
  const big = await fetch(`${baseURL}/_serverFn/anything`, {
    method: 'POST',
    headers: sameSite,
    body: 'x'.repeat(65 * 1024),
  })
  expect(big.status).toBe(413)
  expect(await big.json()).toEqual({
    ok: false,
    error: { code: 'too_large', message: 'That request is too large.' },
  })

  // A streamed body with no Content-Length.
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('{}'))
      c.close()
    },
  })
  const chunked = await fetch(`${baseURL}/_serverFn/anything`, {
    method: 'POST',
    headers: sameSite,
    body: stream,
    duplex: 'half',
  } as RequestInit)
  expect(chunked.status).toBe(411)
})

test('server functions are rate-limited per client, with the safe envelope', async ({ baseURL }) => {
  // A test address of our own, so this doesn't throttle other tests. Locally the header is
  // trusted; on Cloudflare the edge sets it and a client cannot.
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`
  const call = () => fetch(`${baseURL}/_serverFn/anything`, { headers: { 'cf-connecting-ip': ip } })
  // The window is fixed: 210 calls cross the 100-per-minute line even across a minute boundary.
  const statuses: number[] = []
  for (let i = 0; i < 21; i++)
    statuses.push(...(await Promise.all(Array.from({ length: 10 }, call))).map((r) => r.status))
  expect(statuses).toContain(429)
  const limited = await call()
  expect(limited.status).toBe(429)
  expect(limited.headers.get('retry-after')).toBe('60')
  expect(await limited.json()).toMatchObject({ ok: false, error: { code: 'rate_limited' } })
})

test('Turnstile is off without keys: nothing loads from challenges.cloudflare.com', async ({ page }) => {
  const thirdParty: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) thirdParty.push(r.url())
  })
  await page.goto('/notes')
  await hydrated(page)
  expect(thirdParty).toEqual([])
})

test('robots.txt, sitemap.xml, llms.txt and security.txt are served', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('User-agent: GPTBot')
  expect(robots).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m)
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>')
  expect((await request.get('/llms.txt')).status()).toBe(200)
  const security = await request.get('/.well-known/security.txt')
  expect(security.headers()['content-type']).toContain('text/plain')
  const text = await security.text()
  expect(text).toMatch(/^Contact: (mailto:|https:)/m)
  const expires = new Date(/^Expires: (.+)$/m.exec(text)![1]!)
  expect(expires.getTime() - Date.now()).toBeGreaterThan(30 * 86_400_000)
})

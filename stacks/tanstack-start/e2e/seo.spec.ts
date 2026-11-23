import { type APIRequestContext, expect, test } from '@playwright/test'

import { hydrated } from './helpers'

// What crawlers get: the server HTML, read without running any script.
const head = async (request: APIRequestContext, path: string) => {
  const response = await request.get(path)
  const html = await response.text()
  const pick = (re: RegExp) => re.exec(html)?.[1]
  return {
    status: response.status(),
    html,
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    ogImage: pick(/<meta property="og:image" content="([^"]*)"/),
    robots: pick(/<meta name="robots" content="([^"]*)"/),
  }
}

test('the home page has its metadata, share tags and JSON-LD in the server HTML', async ({ request }) => {
  const home = await head(request, '/')
  expect(home.title).toBeTruthy()
  expect(home.description).toBeTruthy()
  expect(home.canonical).toMatch(/^https?:\/\/[^/]+\/$/)
  expect(home.ogImage).toMatch(/\/og\.png$/)
  expect(home.robots).toBeUndefined()
  expect(home.html).toContain('<meta name="twitter:card" content="summary_large_image"')
  const ld = /<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/.exec(home.html)![1]!
  const graph = (JSON.parse(ld) as { '@graph': Array<{ '@type': string }> })['@graph']
  expect(graph[0]?.['@type']).toBe('WebSite')
})

test('app pages and the 404 page are noindex', async ({ request }) => {
  const notes = await head(request, '/notes')
  expect(notes.robots).toBe('noindex')
  expect(notes.canonical).toBeUndefined()
  const missing = await head(request, '/does-not-exist')
  expect(missing.status).toBe(404)
  expect(missing.robots).toBe('noindex')
  expect(missing.title).toContain('Page not found')
})

test('every page has a unique title', async ({ request }) => {
  const titles = await Promise.all(
    ['/', '/notes', '/does-not-exist'].map(async (p) => (await head(request, p)).title),
  )
  expect(new Set(titles).size).toBe(titles.length)
})

test('the icon set and share image are served', async ({ request }) => {
  for (const [path, type] of [
    ['/favicon.ico', 'image/'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/apple-touch-icon.png', 'image/png'],
    ['/icon-192.png', 'image/png'],
    ['/icon-512.png', 'image/png'],
    ['/og.png', 'image/png'],
  ] as const) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toContain(type)
  }
  const manifest = (await (await request.get('/site.webmanifest')).json()) as { icons: unknown[] }
  expect(manifest.icons).toHaveLength(2)
})

test('dark mode has no flash: the theme is set before the app script runs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  // Block the app bundle: only the inline head script can set the theme now.
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(background).not.toBe('rgb(255, 255, 255)')
})

test('the theme toggle works and is remembered', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.getByRole('button', { name: 'Switch between light and dark theme' }).click()
  await expect(html).not.toHaveAttribute('data-theme', before!)
  await page.reload()
  await expect(html).not.toHaveAttribute('data-theme', before!)
})

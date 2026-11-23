import AxeBuilder from '@axe-core/playwright'
import { SITE } from '../src/lib/site.ts'
import { expect, test } from './gate'

// A not-launched environment (LAUNCHED is not "true"): production until the person says go live.
// Locally, the `coming-soon` projects run a preview of the same build with LAUNCHED=false; the
// production deploy runs this file against workers.dev while production is not launched.

const NAME = SITE.name
const PAGES = ['/', '/notes', '/this-page-does-not-exist']
const UNAVAILABLE = { ok: false, error: { code: 'unavailable', message: 'This app isn’t open yet.' } }

for (const path of PAGES)
  test(`${path} is the Coming soon page: 200, noindex, the app name, no app code`, async ({ page }) => {
    const scripts: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url())
    })
    const response = await page.goto(path)
    expect(response!.status()).toBe(200)
    expect(response!.headers()['x-robots-tag']).toBe('noindex')
    await expect(page.getByRole('heading', { level: 1, name: 'Coming soon' })).toBeVisible()
    await expect(page.locator('main')).toContainText(NAME)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('script')).toHaveCount(0)
    expect(scripts).toEqual([])
  })

test('robots.txt tells every crawler to stay out; the sitemap and llms.txt are gone', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n')
  for (const path of ['/sitemap.xml', '/llms.txt']) expect((await request.get(path)).status(), path).toBe(404)
})

test('/api/v1 and server functions answer 503 unavailable', async ({ request }) => {
  for (const response of [
    await request.get('/api/v1/notes'),
    await request.post('/api/v1/notes', { data: { title: 'Hi' } }),
    await request.post('/_serverFn/anything', { data: {} }),
  ]) {
    expect(response.status()).toBe(503)
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(await response.json()).toEqual(UNAVAILABLE)
  }
})

for (const theme of ['light', 'dark'] as const)
  test(`the Coming soon page has no axe violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    expect(violations.map((v) => v.id)).toEqual([])
  })

test('it reflows at 320 by 256 with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 })
  await page.goto('/')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true)
})

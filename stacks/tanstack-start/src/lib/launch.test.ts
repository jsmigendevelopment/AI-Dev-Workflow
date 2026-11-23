import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stripJsonc } from '../../scripts/cloudflare/setup'
import { comingSoonPage, isLaunched, prelaunchResponse, PRELAUNCH_ROBOTS } from './launch'
import { seoFileResponse, SEO_ROUTES } from './seo-routes'
import { SITE } from './site'

const at = (path: string, method = 'GET') => {
  const url = new URL(path, 'https://app.example.com')
  return [new Request(url, { method }), url] as const
}

describe('the "Coming soon" switch', () => {
  it('opens the app only for the exact string "true"', () => {
    expect(isLaunched('true')).toBe(true)
    for (const value of ['false', undefined, '', 'TRUE', '1', 'yes'])
      expect(isLaunched(value), value).toBe(false)
  })

  it('answers every page with the same small page: 200, noindex, the app name, no script', async () => {
    for (const path of ['/', '/notes', '/anything/at/all?x=1']) {
      const response = prelaunchResponse(...at(path), 'router')
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
      const html = await response.text()
      expect(html).toContain('<meta name="robots" content="noindex">')
      expect(html).toContain('<h1>Coming soon</h1>')
      expect(html).toContain(SITE.name)
      expect(html).toContain('<html lang="en">')
      expect(html).not.toMatch(/<script\b/i)
      expect(html).not.toContain('/assets/')
    }
    expect(prelaunchResponse(...at('/', 'HEAD'), 'router').status).toBe(200)
  })

  it('escapes the name', async () => {
    const html = await comingSoonPage('<img src=x onerror=alert(1)> & Co').text()
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; Co')
    expect(html).not.toContain('<img')
  })

  it('tells every crawler to stay out, and hides the sitemap and llms.txt', async () => {
    const robots = prelaunchResponse(...at('/robots.txt'), 'router')
    expect(robots.status).toBe(200)
    expect(await robots.text()).toBe(PRELAUNCH_ROBOTS)
    expect(PRELAUNCH_ROBOTS).toBe('User-agent: *\nDisallow: /\n')
    for (const path of ['/sitemap.xml', '/llms.txt'])
      expect(prelaunchResponse(...at(path), 'router').status, path).toBe(404)
  })

  it('answers server functions, /api/v1 and writes with 503 unavailable', async () => {
    const cases = [
      prelaunchResponse(...at('/_serverFn/abc', 'POST'), 'serverFn'),
      prelaunchResponse(...at('/_serverFn/abc'), 'serverFn'),
      prelaunchResponse(...at('/api/v1/notes'), 'router'),
      prelaunchResponse(...at('/api/v1'), 'router'),
      prelaunchResponse(...at('/api/stripe/webhook', 'POST'), 'router'),
      prelaunchResponse(...at('/', 'DELETE'), 'router'),
    ]
    for (const response of cases) {
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: 'unavailable', message: 'This app isn’t open yet.' },
      })
    }
  })

  it('once launched, the Worker answers the real robots.txt, sitemap.xml and llms.txt', async () => {
    const site = 'https://app.example.com'
    for (const path of SEO_ROUTES) expect(seoFileResponse(path, site)?.status, path).toBe(200)
    expect(await seoFileResponse('/robots.txt', site)!.text()).toContain(`Sitemap: ${site}/sitemap.xml`)
    expect(await seoFileResponse('/sitemap.xml', site)!.text()).toContain(`<loc>${site}/</loc>`)
    expect(seoFileResponse('/notes', site)).toBeNull()
  })

  it('wrangler.jsonc sets LAUNCHED in every environment: local dev and test always open', () => {
    const config = JSON.parse(stripJsonc(readFileSync('wrangler.jsonc', 'utf8'))) as {
      vars: Record<string, string>
      assets: { run_worker_first: string[] }
      env: Record<string, { vars: Record<string, string> }>
    }
    expect(config.vars.LAUNCHED).toBe('true')
    expect(config.env.test!.vars.LAUNCHED).toBe('true')
    // "false" until the person says go live (never an agent's call); then "true".
    expect(['true', 'false']).toContain(config.env.production!.vars.LAUNCHED)
    expect(config.env.production!.vars.SITE_PROTECTION).toBe('none')
    expect(config.assets.run_worker_first).toEqual([...SEO_ROUTES])
  })
})

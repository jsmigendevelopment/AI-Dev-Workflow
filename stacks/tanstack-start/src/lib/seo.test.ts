import { describe, expect, it } from 'vitest'
import { pageHead, siteJsonLd } from './seo'
import {
  robotsTxt,
  securityTxt,
  sitemapXml,
  AI_SEARCH_CRAWLERS,
  AI_TRAINING_CRAWLERS,
  llmsTxt,
} from './seo-files'
import { isIndexableHost } from './site-url'

const meta = (head: ReturnType<typeof pageHead>, key: string) =>
  head.meta.find((m) => ('name' in m && m.name === key) || ('property' in m && m.property === key))

describe('pageHead', () => {
  it('gives every page a title, description, absolute canonical and share tags', () => {
    const head = pageHead({ path: '/about', title: 'About', description: 'Who we are.' })
    expect(head.meta[0]).toEqual({ title: 'About · App' })
    expect(meta(head, 'description')).toMatchObject({ content: 'Who we are.' })
    expect(head.links).toEqual([{ rel: 'canonical', href: 'http://localhost:3000/about' }])
    expect(meta(head, 'og:url')).toMatchObject({ content: 'http://localhost:3000/about' })
    expect(meta(head, 'og:image')).toMatchObject({ content: 'http://localhost:3000/og.png' })
    expect(meta(head, 'og:image:width')).toMatchObject({ content: '1200' })
    expect(meta(head, 'twitter:card')).toMatchObject({ content: 'summary_large_image' })
    expect(meta(head, 'robots')).toBeUndefined()
  })

  it('marks app pages noindex and gives them no canonical', () => {
    const head = pageHead({ path: '/notes', title: 'Notes', description: 'x', noindex: true })
    expect(meta(head, 'robots')).toMatchObject({ content: 'noindex' })
    expect(head.links).toEqual([])
  })

  it('emits JSON-LD that parses and cannot close its script tag', () => {
    const { children } = siteJsonLd()
    expect(children).not.toContain('<')
    const graph = JSON.parse(children)['@graph']
    expect(graph.map((n: { '@type': string }) => n['@type'])).toEqual(['WebSite', 'Organization'])
  })
})

describe('build-time SEO files', () => {
  const robots = robotsTxt('https://app.example.com')

  it('disallows AI training crawlers and the shared training token', () => {
    const blocked = robots.split('\n\n')[1]!
    for (const name of AI_TRAINING_CRAWLERS) expect(blocked).toContain(`User-agent: ${name}\n`)
    expect(blocked).toContain('Disallow: /')
    expect(blocked).toContain('User-agent: __usage_ai-training')
  })

  it('never names a search or AI search crawler, so they fall under Allow', () => {
    for (const name of [...AI_SEARCH_CRAWLERS, 'Googlebot', 'Bingbot', 'Applebot'])
      expect(robots).not.toMatch(new RegExp(`User-agent: ${name}\\n`, 'i'))
    expect(robots).toMatch(/User-agent: \*\nAllow: \//)
  })

  it('points to an absolute sitemap with absolute page URLs', () => {
    expect(robots).toContain('Sitemap: https://app.example.com/sitemap.xml')
    expect(sitemapXml('https://app.example.com', ['/', '/about'])).toContain(
      '<loc>https://app.example.com/about</loc>',
    )
    expect(
      llmsTxt('https://app.example.com', { name: 'A', description: 'B' }, [
        { path: '/', title: 'Home', summary: 'S' },
      ]),
    ).toContain('- [Home](https://app.example.com/): S')
  })

  it('writes a security.txt that expires more than 30 days after the build', () => {
    const now = new Date('2026-11-22T00:00:00Z')
    const text = securityTxt('https://app.example.com', 'mailto:security@example.com', now)
    expect(text).toContain('Contact: mailto:security@example.com\n')
    const expires = new Date(/Expires: (.+)/.exec(text)![1]!)
    expect(expires.getTime() - now.getTime()).toBeGreaterThan(30 * 86_400_000)
    expect(expires.getTime() - now.getTime()).toBeLessThan(365 * 86_400_000)
  })
})

describe('noindex outside production', () => {
  it('lets localhost be indexed (Lighthouse) and sends everything else noindex when SITE_URL is unset', () => {
    expect(isIndexableHost('localhost')).toBe(true)
    expect(isIndexableHost('pr-12-app.acct.workers.dev')).toBe(false)
    expect(isIndexableHost('app.example.com')).toBe(false)
  })
})

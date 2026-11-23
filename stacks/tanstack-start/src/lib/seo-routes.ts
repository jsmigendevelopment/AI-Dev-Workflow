import { llmsTxt, robotsTxt, sitemapXml } from './seo-files'
import { INDEXABLE_PAGES, SITE } from './site'

/**
 * robots.txt, sitemap.xml and llms.txt, answered by the Worker (`assets.run_worker_first` in
 * `wrangler.jsonc`) so a not-launched environment can answer them differently (src/lib/launch.ts).
 * security.txt stays a static file from the build. `pnpm dev` serves all four from vite.config.ts.
 */
export const SEO_ROUTES = ['/robots.txt', '/sitemap.xml', '/llms.txt'] as const

export function seoFileResponse(pathname: string, siteUrl: string): Response | null {
  const text = (body: string, type: string) =>
    new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' } })
  if (pathname === '/robots.txt') return text(robotsTxt(siteUrl), 'text/plain; charset=utf-8')
  if (pathname === '/sitemap.xml')
    return text(
      sitemapXml(
        siteUrl,
        INDEXABLE_PAGES.map((p) => p.path),
      ),
      'application/xml',
    )
  if (pathname === '/llms.txt')
    return text(llmsTxt(siteUrl, SITE, INDEXABLE_PAGES), 'text/plain; charset=utf-8')
  return null
}

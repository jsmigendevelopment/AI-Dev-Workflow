import { problemResponse } from './app-error'
import { escapeHtml, plainPage } from './plain-page'
import { isApiPath } from './request-limits'
import { SITE } from './site'

/**
 * "Coming soon": what a not-yet-launched environment answers instead of the app. Production starts
 * here (`LAUNCHED` is "false" in `env.production.vars` of `wrangler.jsonc`); going live is the
 * person's call, never an agent's (AGENTS.md, always-stop list).
 *
 * - a page (GET or HEAD): a small generic page with the app's name, status 200, noindex, no script;
 * - robots.txt: `Disallow: /` for everyone;
 * - sitemap.xml and llms.txt: 404 (they would describe the app);
 * - server functions, `/api/v1` and anything else that isn't a page read: 503 `unavailable`.
 *
 * Static files (icons, the hashed build) are served by the assets layer before the Worker runs, so
 * the page's favicon loads. Nothing links to the app's bundles while it is not launched.
 */

export const PRELAUNCH_ROBOTS = 'User-agent: *\nDisallow: /\n'

export function comingSoonPage(name: string = SITE.name): Response {
  return plainPage(
    `${name}: coming soon`,
    `<h1>Coming soon</h1>\n<p>${escapeHtml(name)} isn’t open yet. Check back soon.</p>`,
  )
}

export function prelaunchResponse(
  request: Request,
  url: URL,
  handlerType: 'router' | 'serverFn',
  name: string = SITE.name,
): Response {
  const read = request.method === 'GET' || request.method === 'HEAD'
  if (handlerType === 'serverFn' || isApiPath(url.pathname) || !read)
    return problemResponse('unavailable', 'This app isn’t open yet.')
  if (url.pathname === '/robots.txt')
    return new Response(PRELAUNCH_ROBOTS, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    })
  if (url.pathname === '/sitemap.xml' || url.pathname === '/llms.txt')
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  return comingSoonPage(name)
}

/** `LAUNCHED` as the Worker sees it: only the exact string "true" opens the app. */
export const isLaunched = (value: string | undefined): boolean => value === 'true'

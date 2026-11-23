import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { problemResponse } from '@/lib/app-error'
import { isLaunched, prelaunchResponse } from '@/lib/launch'
import { checkBody, isApiPath, SCANNER_PATH } from '@/lib/request-limits'
import { rateLimitKey } from '@/lib/rate-limit-key'
import {
  botChallengeOrigin,
  clerkHostFromKey,
  createNonce,
  pageCsp,
  SECURITY_HEADERS,
  withHeaders,
} from '@/lib/security-headers'
import { seoFileResponse } from '@/lib/seo-routes'
import { siteGate } from '@/lib/site-gate'
import { DEFAULT_SITE_URL } from '@/lib/site'
import { isIndexableHost, SITE_URL } from '@/lib/site-url'
import { serverEnv } from './env'

/**
 * The first request middleware (src/start.ts). Every request that reaches the Worker passes here
 * before Start parses a body or renders a page. In order:
 *
 * 1. validate the Worker's env (fails fast, names only);
 * 2. scanner paths (`/wp-login.php`, `/.env`) get a plain 404 with no render;
 * 3. not launched (`LAUNCHED` isn't "true"): the "Coming soon" page, robots `Disallow: /`, and
 *    503 for server functions and `/api/v1` (src/lib/launch.ts). Nothing of the app runs;
 * 4. `SITE_PROTECTION` "password" (test and previews): the password gate (src/lib/site-gate.ts);
 * 5. robots.txt, sitemap.xml and llms.txt (src/lib/seo-routes.ts);
 * 6. a server function or `/api/v1` call with no body length or over the cap is refused before
 *    anything reads it, then rate-limited per client (IPv4 or IPv6 /64);
 * 7. a server function or `/api/v1` route that crashed answers with the safe `internal` envelope;
 * 8. every response gets the security headers; HTML gets a CSP with a fresh nonce. A non-HTML
 *    response that set its own, stricter CSP (a file download) keeps it.
 *
 * Static files never get here (except the three in `assets.run_worker_first`): `public/_headers`
 * gives them the same headers.
 */

const plain404 = () =>
  new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

/** True while this client is under the limit. Fails open: the binding is approximate anyway. */
async function underLimit(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true
  try {
    const { success } = await limiter.limit({ key: rateLimitKey(request.headers.get('cf-connecting-ip')) })
    return success
  } catch (error) {
    // A limiter outage must not block users.
    console.error('rate limiter unavailable', error instanceof Error ? error.name : 'error')
    return true
  }
}

const limitCalls = createServerOnlyFn(async (request: Request): Promise<Response | null> => {
  if (await underLimit(env.RATE_LIMITER, request)) return null
  return problemResponse('rate_limited', 'Too many requests. Wait a minute and try again.', {
    'Retry-After': '60',
  })
})

const limitPasswordTries = createServerOnlyFn((request: Request) => underLimit(env.PASSWORD_LIMITER, request))

function responseHeaders(response: Response, url: URL, nonce: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { ...SECURITY_HEADERS }
  const isHtml = response.headers.get('content-type')?.startsWith('text/html') ?? false
  // A route's own policy (e.g. `default-src 'none'; sandbox` on a download) is stricter than the
  // baseline: keep it. HTML always gets the page policy below.
  if (!isHtml && response.headers.has('content-security-policy')) delete headers['Content-Security-Policy']
  if (isHtml && nonce && !import.meta.env.DEV) {
    const { CLERK_PUBLISHABLE_KEY, TURNSTILE_SITE_KEY } = serverEnv()
    headers['Content-Security-Policy'] = pageCsp(nonce, {
      clerkHost: clerkHostFromKey(CLERK_PUBLISHABLE_KEY),
      turnstile: Boolean(TURNSTILE_SITE_KEY),
      botChallengeOrigin: botChallengeOrigin(url, SITE_URL, DEFAULT_SITE_URL),
    })
  }
  // Server-rendered HTML can hold the signed-in user's data: never in a shared cache, always
  // revalidated, and still back/forward-cache friendly (no `no-store`).
  if (isHtml) headers['Cache-Control'] = 'private, no-cache'
  else if (!response.headers.has('cache-control')) headers['Cache-Control'] = 'private, no-store'
  if (!isIndexableHost(url.hostname)) headers['X-Robots-Tag'] = 'noindex'
  return headers
}

export const requestGuards = createMiddleware().server(async ({ request, next, handlerType }) => {
  const { LAUNCHED, SITE_PROTECTION, SITE_PASSWORD } = serverEnv()
  const url = new URL(request.url)
  const finish = (response: Response, nonce?: string) =>
    withHeaders(response, responseHeaders(response, url, nonce))

  if (handlerType === 'router' && SCANNER_PATH.test(url.pathname)) return finish(plain404())
  if (!isLaunched(LAUNCHED)) return finish(prelaunchResponse(request, url, handlerType), createNonce())
  if (SITE_PROTECTION === 'password' && SITE_PASSWORD) {
    const gated = await siteGate(request, url, handlerType, SITE_PASSWORD, limitPasswordTries)
    if (gated) return finish(gated, createNonce())
  }
  if (handlerType === 'router') {
    const file = seoFileResponse(url.pathname, SITE_URL)
    if (file) return finish(file)
  }
  // Server functions and the /api/v1 routes. Any other server route (uploads, webhooks) bounds
  // its own body with checkBody(request, itsOwnCap).
  const api = handlerType === 'router' && isApiPath(url.pathname)
  if (handlerType === 'serverFn' || api) {
    const refused = checkBody(request) ?? (await limitCalls(request))
    if (refused) return finish(refused)
  }

  const nonce = handlerType === 'router' ? createNonce() : undefined
  const result = await next({ context: { cspNonce: nonce } })
  let response = result.response
  const envelope = response.headers.get('content-type')?.startsWith('application/json') ?? false
  if ((handlerType === 'serverFn' || (api && !envelope)) && response.status >= 500) {
    // Start would serialize the thrown error; the stack stays in the log, the client gets the envelope.
    console.error(api ? 'api route failed' : 'server function failed', response.status)
    response = problemResponse('internal', 'Something went wrong. Try again.')
  }
  return finish(response, nonce)
})

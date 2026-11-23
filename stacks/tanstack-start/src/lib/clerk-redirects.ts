/**
 * Clerk redirects that leave the site (#66). On a development instance `@clerk/backend` answers a
 * page request carrying `__clerk_redirect_url` (`primary-responds-to-syncing`) with a 307 to that
 * URL plus the dev browser token, `__clerk_db_jwt`, whatever its origin. Clerk's browser SDK reads
 * `__clerk_satellite_url` from the address bar to send a signed-in user back to a satellite. So a
 * crafted link could hand a tester's dev session to any site. Both targets must be one of the
 * app's authorized parties (src/lib/authorized-parties.ts); every redirect Clerk itself answers
 * with must stay on those or on Clerk's Frontend API, where its handshake goes.
 */

import { clerkHostFromKey } from './security-headers'

/** The `__clerk*` query parameters whose value is a URL Clerk sends the browser to. */
export const CLERK_REDIRECT_PARAMS: readonly string[] = ['__clerk_redirect_url', '__clerk_satellite_url']

/** The http(s) origin of an absolute URL, or null for anything else (relative, `//x`, `data:`). */
function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    // Defence in depth: other schemes have the opaque origin "null", which no allowed origin
    // should ever be, but a list read from config must never be able to match one.
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    // Not an absolute URL. Clerk's own `new URL(value)` would throw too (a 500).
    return null
  }
}

/**
 * The name of the first redirect-target parameter whose value is not an absolute URL on one of
 * `allowed` (exact origins), or null when there is none. Names compare case-insensitively and
 * every repeat is checked, so no spelling of the parameter gets past.
 */
export function foreignRedirectParam(url: URL, allowed: readonly string[]): string | null {
  for (const [name, value] of url.searchParams) {
    if (!CLERK_REDIRECT_PARAMS.includes(name.toLowerCase())) continue
    const origin = httpOrigin(value)
    if (origin === null || !allowed.includes(origin)) return name
  }
  return null
}

/** Where a redirect may go: the app's own origins, and Clerk's Frontend API for its handshake. */
export interface RedirectOrigins {
  parties: readonly string[]
  frontendApi: readonly string[]
}

/**
 * True for a 3xx whose `Location`, resolved against `base`, is on neither the parties nor the
 * Frontend API, or is on the Frontend API with a `redirect_url` (where Clerk sends the browser
 * back after the handshake) that is not an absolute URL on one of the parties.
 */
export function leavesAllowedOrigins(response: Response, base: URL, allowed: RedirectOrigins): boolean {
  if (response.status < 300 || response.status >= 400) return false
  const location = response.headers.get('location')
  if (location === null) return false
  let url: URL
  try {
    url = new URL(location, base)
  } catch {
    // An unparseable Location is no redirect we can vouch for.
    return true
  }
  if (allowed.parties.includes(url.origin)) return false
  if (!allowed.frontendApi.includes(url.origin)) return true
  return url.searchParams.getAll('redirect_url').some((back) => {
    const origin = httpOrigin(back)
    return origin === null || !allowed.parties.includes(origin)
  })
}

/** Clerk's Frontend API origin, read from the publishable key: where its handshake redirects go. */
export function clerkFrontendOrigins(publishableKey: string | undefined): string[] {
  const host = clerkHostFromKey(publishableKey)
  return host ? [`https://${host}`] : []
}

/**
 * The answer to a request that names a foreign redirect target. 400, not a stripped request:
 * Clerk's browser SDK reads these parameters from the address bar too, which the server can't
 * strip, so no page or script loads with one. No Clerk flow builds a foreign one.
 */
export function refusedRedirect(serverFn: boolean): Response {
  const message = 'This link would send you to another site. Open the app from its own address.'
  const headers = { 'Cache-Control': 'no-store' }
  if (serverFn)
    return Response.json({ ok: false, error: { code: 'validation', message } }, { status: 400, headers })
  return new Response(`${message}\n`, {
    status: 400,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

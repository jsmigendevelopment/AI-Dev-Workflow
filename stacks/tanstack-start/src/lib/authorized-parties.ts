/**
 * Clerk's `authorizedParties`: the origins a session token may have been issued to (its `azp`
 * claim, the `Origin` the browser sent to Clerk). A token minted for another site on the same
 * Clerk instance is refused. Since @clerk/backend 3.12 a token with no `azp` is refused too, once
 * the list is set. Built per request in src/server/auth.ts from config that already exists:
 *
 * - `SITE_URL` (build time), the production origin;
 * - `CLERK_AUTHORIZED_PARTIES` (runtime, optional), more exact origins, comma-separated;
 * - the request's own origin, only when it is loopback in a local build, or the test Worker's
 *   own workers.dev host or one of its previews (`pr-<n>-<test worker>.<subdomain>.workers.dev`)
 *   in a test build. It is the host the request reached, so a stranger's site never matches it:
 *   a token for `pr-1-app-test.evil.workers.dev` has that `azp`, not ours.
 *
 * One exception, `isNativeBearer`: a native app sends no `Origin`, so its token has no `azp`.
 * It must carry our own claim instead (`app`, from the instance's session token claims).
 */

import { bearerToken } from './http'
import { isApiPath } from './request-limits'

export type DeployEnv = 'local' | 'test' | 'production'

/** What the build was made for (vite.config.ts inlines it). */
export interface BuildTarget {
  /** `CLOUDFLARE_ENV` at build time; unset is a local build (dev, unit and e2e tests). */
  deployEnv: DeployEnv
  /** The test Worker's name from wrangler.jsonc, in a test build only. */
  testWorker: string
  /** The build's `SITE_URL`, or '' when it was not set. */
  siteUrl: string
}

/**
 * Stands in for an empty list, which Clerk reads as "skip the azp check". It is not an origin
 * (its origin is "null") and Clerk omits `azp` rather than send "null", so no token matches it.
 */
export const NO_PARTY = 'urn:invalid:no-authorized-party'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'

/** The comma-separated list, trimmed. Its shape is checked in src/lib/env-schema.ts. */
function parseOrigins(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

function isTestWorkerHost(url: URL, testWorker: string): boolean {
  if (!testWorker || url.protocol !== 'https:' || url.port !== '') return false
  const worker = testWorker.replace(/[^a-z0-9-]/g, '\\$&')
  return new RegExp(`^(?:pr-\\d{1,6}-)?${worker}\\.${LABEL}\\.workers\\.dev$`).test(url.hostname)
}

function ownOrigin(url: URL, target: BuildTarget): string | null {
  if (target.deployEnv === 'local' && LOOPBACK.has(url.hostname)) return url.origin
  if (target.deployEnv === 'test' && isTestWorkerHost(url, target.testWorker)) return url.origin
  return null
}

function fixedParties(siteUrl: string, extra: string | undefined): string[] {
  return [...(siteUrl ? [new URL(siteUrl).origin] : []), ...parseOrigins(extra)]
}

/** The list for one request. Never empty: an empty list would turn the check off. */
export function authorizedParties(url: URL, target: BuildTarget, extra: string | undefined): string[] {
  const own = ownOrigin(url, target)
  const parties = [...new Set([...fixedParties(target.siteUrl, extra), ...(own ? [own] : [])])]
  return parties.length > 0 ? parties : [NO_PARTY]
}

interface ClerkVars {
  CLERK_SECRET_KEY?: string
  VITE_CLERK_PUBLISHABLE_KEY?: string
  CLERK_AUTHORIZED_PARTIES?: string
}

/**
 * Null when the config is fine. Production (or live keys anywhere) has no own-origin rule, so
 * without SITE_URL or CLERK_AUTHORIZED_PARTIES nobody could sign in: fail at startup instead,
 * naming the variables, never a value.
 */
export function partiesConfigError(env: ClerkVars, target: BuildTarget): string | null {
  if (!env.CLERK_SECRET_KEY || !env.VITE_CLERK_PUBLISHABLE_KEY) return null
  const needsFixed = target.deployEnv === 'production' || env.CLERK_SECRET_KEY.startsWith('sk_live_')
  if (!needsFixed || fixedParties(target.siteUrl, env.CLERK_AUTHORIZED_PARTIES).length > 0) return null
  return 'CLERK_AUTHORIZED_PARTIES is missing (Clerk keys are set for production: set the SITE_URL variable for the build, or list the app’s origins in CLERK_AUTHORIZED_PARTIES)'
}

/** The token's claims, unverified (Clerk verifies it next), or null when it isn't a JWT. */
function unverifiedClaims(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const claims: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : null
  } catch {
    // Not base64 or not JSON: not a native token. Clerk refuses it on its own.
    return null
  }
}

/** The custom session-token claim a native token must carry (Clerk: Sessions → Customize session token). */
export const NATIVE_APP_CLAIM = 'app'

/** The two variables that turn the native path on. Both checked in src/lib/env-schema.ts. */
export interface NativeConfig {
  CLERK_ALLOW_NATIVE_TOKENS?: string
  CLERK_NATIVE_APP_CLAIM?: string
}

/** True when native tokens are allowed but no claim value is set: the native path stays off. */
export function nativeClaimMissing(config: NativeConfig): boolean {
  return config.CLERK_ALLOW_NATIVE_TOKENS === 'true' && !config.CLERK_NATIVE_APP_CLAIM
}

/**
 * True only for a native app's call (`CLERK_ALLOW_NATIVE_TOKENS` on and `CLERK_NATIVE_APP_CLAIM`
 * set): `Authorization: Bearer` on `/api/v1`, with a token that has no `azp` claim at all and an
 * `app` claim equal to `CLERK_NATIVE_APP_CLAIM`. That one request is verified without
 * `authorizedParties`; signature, expiry and token type are still checked, so the claim read here
 * unverified is the one Clerk then verifies. Never the cookie (with a header Clerk reads only the
 * header), never a token that names an origin, even a wrong one. Anything else falls back to the
 * list, where a token with no `azp` is refused: the same 401 as no token.
 */
export function isNativeBearer(request: Request, config: NativeConfig): boolean {
  const app = config.CLERK_NATIVE_APP_CLAIM
  if (config.CLERK_ALLOW_NATIVE_TOKENS !== 'true' || !app) return false
  if (!isApiPath(new URL(request.url).pathname)) return false
  // Belt and braces: Clerk reads the cookie when it doesn't take the header, and this path
  // turns the origin check off. Any Clerk session cookie and it's not a native call.
  if (hasClerkSessionCookie(request)) return false
  const token = bearerToken(request)
  const claims = token ? unverifiedClaims(token) : null
  return claims !== null && !('azp' in claims) && claims[NATIVE_APP_CLAIM] === app
}

const CLERK_SESSION_COOKIE = /^(__session|__client_uat)(_|$)/

function hasClerkSessionCookie(request: Request): boolean {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .some((pair) => CLERK_SESSION_COOKIE.test(pair.trim().split('=')[0] ?? ''))
}

// Clerk reads its own query parameters even on an API call: a handshake token or nonce (a junk one
// made a development instance throw, a 500), `__clerk_redirect_url`, `__clerk_db_jwt` and
// `__clerk_synced` (a redirect or a handshake). `/api/v1` takes part in none of them.
const isClerkParam = (name: string): boolean => name.toLowerCase().startsWith('__clerk')

// Proxy headers Clerk builds its own URL from (`deriveUrlFromHeaders`, `forwardedProto`). On a
// Worker `request.url` is the host the request reached; a client can send these with any value,
// and Clerk would put that host in a handshake's `redirect_url` or a redirect's Location (#66).
const FORWARDED_HEADERS = [
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'cloudfront-forwarded-proto',
  'forwarded',
]

/**
 * The request Clerk sees. On every path, without the proxy headers above. On `/api/v1` only the
 * header may sign in, so Clerk also gets no `Cookie` and the URL without any `__clerk*` query
 * parameter: a cookie can't authenticate an API call whatever the `Authorization` header says,
 * and Clerk's parameters in the query are a plain 401. No body: Clerk never needs it and the
 * route still reads the original request, query and proxy headers included. A page with no proxy
 * header gets the original request.
 */
export function requestForClerk(request: Request): Request {
  const url = new URL(request.url)
  const api = isApiPath(url.pathname)
  const forwarded = FORWARDED_HEADERS.filter((name) => request.headers.has(name))
  if (!api && forwarded.length === 0) return request
  const headers = new Headers(request.headers)
  for (const name of forwarded) headers.delete(name)
  if (api) {
    headers.delete('cookie')
    const clerkParams = [...new Set([...url.searchParams.keys()].filter(isClerkParam))]
    // Only when present: deleting re-encodes the whole query string.
    for (const name of clerkParams) url.searchParams.delete(name)
  }
  return new Request(url, { method: request.method, headers })
}

/**
 * True when Clerk answered an `/api/v1` call with a redirect (a handshake or a sign-in redirect).
 * The API never redirects for auth: the caller gets the uniform 401 instead.
 */
export function isApiRedirect(request: Request, response: Response): boolean {
  return isApiPath(new URL(request.url).pathname) && response.status >= 300 && response.status < 400
}

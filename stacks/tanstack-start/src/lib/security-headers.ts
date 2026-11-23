/**
 * Security headers, in one list. Two paths send them and must agree:
 * - `public/_headers` for static files (the assets layer, no Worker), checked by a unit test;
 * - `src/server/request-guards.ts` for every Worker response (pages, server functions, 404s).
 *
 * HTML from the Worker gets the full CSP with a fresh nonce per response. Everything else gets the
 * baseline, which has no `script-src` (it would also govern worker scripts served as files).
 */
export const SECURITY_HEADERS = {
  // No `preload`: that is the domain owner's call and is apex-only.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
} as const

/** Third-party origins a page may need. Added only when the feature is configured. */
export interface CspSources {
  /** Clerk's Frontend API host, from the publishable key (e.g. `clerk.example.com`). */
  clerkHost?: string | undefined
  /** Turnstile is configured: allow its script and frame. */
  turnstile?: boolean
  /**
   * The production origin, when this response is for the production custom domain: Bot Fight
   * Mode's JavaScript Detections inject a script from `/cdn-cgi/challenge-platform/` (Cloudflare
   * adds this response's nonce to it) and call `/cdn-cgi/bm/`. See `botChallengeOrigin`.
   */
  botChallengeOrigin?: string | undefined
}

/** Same-origin paths Bot Fight Mode's JavaScript Detections need (Cloudflare's docs, 2026-11). */
export const BOT_CHALLENGE_PATHS = ['/cdn-cgi/challenge-platform/', '/cdn-cgi/bm/'] as const

/**
 * The origin to open for Bot Fight Mode: only on the production custom domain (the SITE_URL host),
 * the one host in a Cloudflare zone. workers.dev, previews and localhost get nothing extra.
 */
export function botChallengeOrigin(url: URL, siteUrl: string, defaultSiteUrl: string): string | undefined {
  if (siteUrl === defaultSiteUrl || url.protocol !== 'https:') return undefined
  return url.hostname === new URL(siteUrl).hostname ? url.origin : undefined
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Origins every page allows on top of the defaults: the one place to open the CSP for a
 * third-party service you add on purpose. Empty by default; never add `'unsafe-inline'` or `*`.
 * Example, Cloudflare Web Analytics: script `https://static.cloudflareinsights.com`,
 * connect `https://cloudflareinsights.com`.
 */
export const CSP_EXTRA: Readonly<Record<'script' | 'connect' | 'img' | 'frame', readonly string[]>> = {
  script: [],
  connect: [],
  img: [],
  frame: [],
}

/**
 * The page policy: scripts only from this origin or with this response's nonce. No
 * `'unsafe-inline'` for scripts and no `'strict-dynamic'` (it would ignore `'self'` and block the
 * entry module, which carries no nonce attribute of its own in some builds). Styles stay open:
 * React writes `style` attributes at runtime.
 */
export function pageCsp(nonce: string, sources: CspSources = {}, extra = CSP_EXTRA): string {
  const script = ["'self'", `'nonce-${nonce}'`, ...extra.script]
  const connect = ["'self'", ...extra.connect]
  const img = ["'self'", 'data:', ...extra.img]
  const frame: string[] = [...extra.frame]
  const worker = ["'self'"]
  if (sources.clerkHost) {
    const clerk = `https://${sources.clerkHost}`
    script.push(clerk, TURNSTILE_ORIGIN)
    connect.push(clerk)
    img.push('https://img.clerk.com')
    frame.push(TURNSTILE_ORIGIN)
    worker.push('blob:')
  }
  if (sources.botChallengeOrigin)
    for (const path of BOT_CHALLENGE_PATHS) {
      script.push(`${sources.botChallengeOrigin}${path}`)
      connect.push(`${sources.botChallengeOrigin}${path}`)
    }
  if (sources.turnstile) {
    if (!script.includes(TURNSTILE_ORIGIN)) script.push(TURNSTILE_ORIGIN)
    if (!frame.includes(TURNSTILE_ORIGIN)) frame.push(TURNSTILE_ORIGIN)
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    `frame-src ${frame.length ? frame.join(' ') : "'none'"}`,
    `worker-src ${worker.join(' ')}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')
}

/** 128 random bits, base64. A new one for every HTML response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Clerk publishable keys are `pk_test_` or `pk_live_` plus base64 of `<frontend-api-host>$`.
 * Returns the host, or undefined for anything that doesn't decode to a plain host name.
 */
export function clerkHostFromKey(publishableKey: string | undefined): string | undefined {
  const encoded = publishableKey?.split('_')[2]
  if (!encoded) return undefined
  try {
    const host = atob(encoded).replace(/\$$/, '')
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : undefined
  } catch {
    return undefined
  }
}

/** Sets every header in place, or on a copy when the response's headers are immutable. */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  try {
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    return response
  } catch {
    const copy = new Response(response.body, response)
    for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value)
    return copy
  }
}

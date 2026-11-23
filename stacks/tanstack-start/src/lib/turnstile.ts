/**
 * Turnstile's server-side check, pure apart from `fetch`, so it is unit-tested with a stub. The
 * wiring (keys, request headers, the middleware) is in src/server/turnstile.ts.
 */

/** The header a form's Turnstile token travels in. */
export const TURNSTILE_HEADER = 'x-turnstile-token'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type HumanCheck = 'passed' | 'failed'

/** Pure apart from `fetch`, so it is unit-tested with a stub. Fails closed on any error. */
export async function verifyTurnstile(opts: {
  secret: string
  token: string | undefined
  remoteIp: string | undefined
  expectedHost: string
  fetch?: typeof fetch
}): Promise<HumanCheck> {
  if (!opts.token || opts.token.length > 2048) return 'failed'
  const body = new URLSearchParams({ secret: opts.secret, response: opts.token })
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp)
  try {
    const response = await (opts.fetch ?? fetch)(SITEVERIFY, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return 'failed'
    const result: { success?: boolean; hostname?: string } = await response.json()
    // Cloudflare's test secrets answer with hostname "example.com"; real ones with the page's host.
    const testSecret = /^[123]x0{20,}AA$/.test(opts.secret)
    const hostOk = result.hostname === opts.expectedHost || (testSecret && result.hostname === 'example.com')
    return result.success === true && hostOk ? 'passed' : 'failed'
  } catch {
    return 'failed'
  }
}

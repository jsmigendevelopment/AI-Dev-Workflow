import { problemResponse } from './app-error'
import { isOpenPath, OPEN_PATHS } from './open-paths'
import { escapeHtml, plainPage } from './plain-page'
import { checkBody, isApiPath } from './request-limits'

/**
 * The password gate: option (b) of setup-cloudflare's test and preview protection. On only where
 * `SITE_PROTECTION` is "password" (`env.test.vars`, so the test Worker and its previews), never in
 * production, which has the "Coming soon" page until launch instead.
 *
 * - A person types the password once; the answer sets an HttpOnly, Secure, SameSite=Lax session
 *   cookie holding an HMAC of the password (never the password itself).
 * - The session deploys' smoke test sends the password in `x-site-password` on every request. Never `Authorization`: `/api/v1`
 *   reads `Authorization: Bearer` for Clerk.
 * - Comparisons are constant-time; wrong answers are rate-limited per client.
 * - It covers what the Worker answers (pages, server functions, `/api/v1`). Static files (the
 *   hashed JS and CSS, icons) come from the assets layer and stay reachable: Cloudflare Access,
 *   option (a), covers those too.
 */

export const GATE_PATH = '/__site-password'
export const GATE_COOKIE = '__Host-site-pass'
export const GATE_HEADER = 'x-site-password'

const encoder = new TextEncoder()

async function hmac(password: string, label: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(label)))
}

/** Same length in, same time out: every byte is compared whatever the first difference. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))

/** Hashes both first, so the comparison never depends on the guess's length or content. */
export async function passwordMatches(given: string | null | undefined, password: string): Promise<boolean> {
  if (typeof given !== 'string') return false
  return constantTimeEqual(await digest(given), await digest(password))
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** The cookie value: changes when the password does, and never reveals it. */
export const gateToken = async (password: string) => base64url(await hmac(password, 'site-gate:v1'))

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

/** Only a path on this site: never `//host`, `/\host` or a full URL (no open redirect). */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\'))
    return '/'
  if (next.startsWith(GATE_PATH)) return '/'
  return next.slice(0, 2048)
}

export function gatePage(next: string, problem?: string, status = 401): Response {
  const error = problem
    ? `<p class="error" id="password-error" role="alert">${escapeHtml(problem)}</p>`
    : '<p class="error" id="password-error" role="alert"></p>'
  const invalid = problem ? ' aria-invalid="true" aria-describedby="password-error"' : ''
  return plainPage(
    'Password needed',
    `<h1>Password needed</h1>
<p>This is a test copy of the site. Enter the password to continue.</p>
<form method="post" action="${GATE_PATH}">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required${invalid}>
${error}
<button type="submit">Continue</button>
</form>`,
    status,
    // RFC 9110 wants a scheme with a 401; this one names the form, not HTTP auth.
    { 'WWW-Authenticate': 'Form realm="site"' },
  )
}

/** Counts one wrong answer for this client; false once it is over the limit. */
export type AttemptLimiter = (request: Request) => Promise<boolean>

const tooMany = (next: string) => {
  const page = gatePage(next, 'Too many tries. Wait a minute and try again.', 429)
  page.headers.set('Retry-After', '60')
  return page
}

async function login(request: Request, url: URL, password: string, allowAttempt: AttemptLimiter) {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none'))
    return problemResponse('forbidden', 'Send the form from this site.')
  const refused = checkBody(request, 4096)
  if (refused) return refused
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return gatePage('/', 'Type the password and press Continue.', 400)
  }
  const next = safeNext(form.get('next'))
  const given = form.get('password')
  if (await passwordMatches(typeof given === 'string' ? given : null, password))
    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        'Set-Cookie': `${GATE_COOKIE}=${await gateToken(password)}; Path=/; Secure; HttpOnly; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    })
  if (!(await allowAttempt(request))) return tooMany(next)
  return gatePage(next, 'That password is not right.')
}

/**
 * Null when the request may go on; otherwise the answer. Runs in the request guards, before the
 * body limits and before anything renders.
 */
export async function siteGate(
  request: Request,
  url: URL,
  handlerType: 'router' | 'serverFn',
  password: string,
  allowAttempt: AttemptLimiter,
  open: readonly string[] = OPEN_PATHS,
): Promise<Response | null> {
  const header = request.headers.get(GATE_HEADER)
  if (header !== null) {
    if (await passwordMatches(header, password)) return null
    if (!(await allowAttempt(request)))
      return problemResponse('rate_limited', 'Too many tries. Wait a minute and try again.', {
        'Retry-After': '60',
      })
  }
  const token = cookie(request, GATE_COOKIE)
  if (token && constantTimeEqual(encoder.encode(token), encoder.encode(await gateToken(password))))
    return null
  if (handlerType === 'router' && isOpenPath(url.pathname, open)) return null
  if (handlerType === 'router' && url.pathname === GATE_PATH && request.method === 'POST')
    return login(request, url, password, allowAttempt)
  const read = request.method === 'GET' || request.method === 'HEAD'
  if (handlerType === 'serverFn' || isApiPath(url.pathname) || !read)
    return problemResponse('forbidden', 'This test site needs its password.')
  return gatePage(safeNext(url.pathname === GATE_PATH ? '/' : `${url.pathname}${url.search}`))
}

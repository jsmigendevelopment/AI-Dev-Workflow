import { ERROR_STATUS, problemResponse, type ApiResult } from './app-error'

/**
 * Helpers for `/api/v1` server routes: the same envelope as server functions, as real HTTP.
 * Plain functions over `Request` and `Response`, so they are tested in Node.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

/** The envelope as a response: `okStatus` on success, the code's status on failure. */
export function envelopeResponse<T>(result: ApiResult<T>, okStatus = 200): Response {
  const status = result.ok ? okStatus : ERROR_STATUS[result.error.code]
  const headers: Record<string, string> = { ...JSON_HEADERS }
  // RFC 6750: a 401 names the scheme the client should use.
  if (!result.ok && result.error.code === 'unauthenticated') headers['WWW-Authenticate'] = 'Bearer'
  return new Response(JSON.stringify(result), { status, headers })
}

/**
 * The token from `Authorization: Bearer <token>`, or null. Only the header counts: the API never
 * accepts the session cookie, so a cross-site page can't make a signed-in browser call it (CSRF).
 */
export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+([\w.~+/-]+=*)\s*$/i.exec(request.headers.get('authorization') ?? '')
  return match?.[1] ?? null
}

/**
 * The JSON body, or a validation failure for anything that isn't JSON. The size was already
 * checked by the request guards (Content-Length, before anything read the body).
 */
export async function readJson(request: Request): Promise<{ ok: true; data: unknown } | ApiResult<never>> {
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\b/i.test(type))
    return { ok: false, error: { code: 'validation', message: 'Send the body as application/json.' } }
  try {
    return { ok: true, data: await request.json() }
  } catch {
    return { ok: false, error: { code: 'validation', message: 'The body is not valid JSON.' } }
  }
}

/** Query parameters as a plain object; a repeated name keeps its last value. */
export function queryObject(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams)
}

/** The `ANY` handler of an API route: 405 with the methods it does take, never the HTML shell. */
export const methodNotAllowed =
  (...allow: string[]) =>
  () =>
    problemResponse('validation', `Use ${allow.join(' or ')}.`, { Allow: allow.join(', ') }, 405)

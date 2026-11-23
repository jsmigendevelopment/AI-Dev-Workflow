import { problemResponse } from './app-error'

/**
 * Paths only vulnerability scanners ask for. They get a plain 404 with no page render. Block them
 * at the edge too (a WAF rule), where a block is not even counted as a request.
 */
export const SCANNER_PATH =
  /(\.(php\d?|aspx?|jsp|cgi|ini|sql|bak|old)$)|(^\/(wp-|\.env|\.git|\.svn|\.aws|\.ssh|\.ds_store|xmlrpc|phpmyadmin|cgi-bin|vendor\/phpunit))/i

/**
 * The versioned HTTP API for other clients (mobile, desktop). The request guards give it the same
 * body cap and rate limit as server functions. Other server routes (uploads, webhooks) are not
 * covered: each one checks its own body with `checkBody(request, itsOwnCap)`.
 */
export const isApiPath = (pathname: string): boolean =>
  pathname.startsWith('/api/v1/') || pathname === '/api/v1'

/**
 * Server function and `/api/v1` bodies are small JSON. A server route that takes more (uploads,
 * webhooks) checks its own body with `checkBody(request, itsOwnCap)`; never raise this globally.
 */
export const MAX_BODY_BYTES = 64 * 1024

/** Null when the body is acceptable; otherwise the refusal. Reads headers only. */
export function checkBody(request: Request, maxBytes = MAX_BODY_BYTES): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return null
  const length = request.headers.get('content-length')
  if (length === null) {
    if (request.body === null) return null
    return problemResponse('validation', 'Send the request with a Content-Length.', {}, 411)
  }
  const bytes = Number(length)
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    return problemResponse('validation', 'Bad Content-Length.', {}, 400)
  if (bytes > maxBytes) return problemResponse('too_large', 'That request is too large.')
  return null
}

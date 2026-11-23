import { getNormalizedURL } from '@tanstack/react-router/ssr/server'

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

// Anywhere for a control character; a space only at the end, where URL parsing drops it.
const ESCAPED_SPACE_OR_CONTROL = /%(?:[01][0-9a-f]|7f)|%20$/i

// Only the case of an escape's hex digits may differ: Start re-encodes `%c3%a9` as `%C3%A9`.
const upperEscapes = (path: string) => path.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase())

/**
 * The pathname every path guard compares (`isApiPath`, Access paths, `OPEN_PATHS`, the launch and
 * password gates): the one Start routes. Null when Start or the router would resolve the raw path
 * to another one: an empty segment (`/api//v1`), an escaped control character, a trailing escaped
 * space (`/notes%20` loses it), or anything `getNormalizedURL` decodes. That is the function Start
 * uses to pick the route and to tell server functions apart (`/%61pi` is `/api`, `/%5FserverFn` is
 * `/_serverFn`), so a future decoding change fails closed here. A lowercase escape of a non-ASCII
 * character (`/notes/caf%c3%a9`, sent by some API clients) is kept, as Start's `%C3%A9` (#65).
 * Browsers never send the others, so the request guards answer null with a 404 before any other
 * check. Case is the router's `caseSensitive`.
 */
export function canonicalPath(pathname: string): string | null {
  if (pathname.includes('//') || ESCAPED_SPACE_OR_CONTROL.test(pathname)) return null
  const resolved = getNormalizedURL(pathname, 'http://localhost').url.pathname
  return upperEscapes(resolved) === upperEscapes(pathname) ? resolved : null
}

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

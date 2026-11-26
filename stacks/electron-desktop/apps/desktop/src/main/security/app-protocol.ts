import path from 'node:path'

import { APP_NAME } from '@app/contract/app'

/** The packaged screen is served from app://<APP_NAME>/, never file:// (the pack's window hardening). */
export const APP_SCHEME = 'app'
export const APP_HOST = APP_NAME
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Sent with every app:// response. Only the app's own files; nothing remote, no eval, no plugins, no framing. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** Maps an app:// URL to a file inside the screen's folder, or null if it points anywhere else. */
export function resolveAppFile(rendererDir: string, requestUrl: string): string | null {
  if (!URL.canParse(requestUrl)) return null
  const url = new URL(requestUrl)
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null
  const relative = decodeURIComponent(url.pathname)
  const file = path.resolve(rendererDir, `.${relative.endsWith('/') ? `${relative}index.html` : relative}`)
  const root = path.resolve(rendererDir)
  return file.startsWith(`${root}${path.sep}`) ? file : null
}

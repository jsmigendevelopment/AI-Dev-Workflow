import { DEFAULT_SITE_URL } from './site'

/** The one site-URL source, validated and inlined by vite.config.ts (no trailing slash). */
export const SITE_URL: string = import.meta.env.SITE_URL || DEFAULT_SITE_URL

export const absoluteUrl = (path: string) => new URL(path, `${SITE_URL}/`).toString()

/**
 * True on the production host (and on localhost, so Lighthouse can audit a local build). Every
 * other host, such as previews and workers.dev, is answered with `X-Robots-Tag: noindex`. If
 * SITE_URL was never set, production is noindex too: safe until someone sets it.
 */
export function isIndexableHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  return hostname === new URL(SITE_URL).hostname && SITE_URL !== DEFAULT_SITE_URL
}

/**
 * Paths that stay reachable on a protected test site (the password gate or Cloudflare Access)
 * because they check their own signature, such as a payment provider's webhook
 * (`/api/stripe/webhook`). setup-cloudflare makes the same paths public in the Access app, so run
 * it again after changing this list. Exact paths, or a prefix ending in `/*`.
 *
 * No imports: scripts/cloudflare/setup.ts reads this file too.
 */
export const OPEN_PATHS: readonly string[] = []

export const isOpenPath = (pathname: string, open: readonly string[] = OPEN_PATHS): boolean =>
  open.some((p) => (p.endsWith('/*') ? pathname.startsWith(p.slice(0, -1)) : pathname === p))

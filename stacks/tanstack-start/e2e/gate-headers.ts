/**
 * The deployed test site and its previews can be protected (setup-cloudflare --protect). The
 * session deploys (`pnpm deploy:test`, `pnpm deploy:preview`) then set these for the smoke test,
 * from the shell or .env.cloudflare.local, and every request to the site carries them:
 *
 * - Cloudflare Access: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (a service token);
 * - the password gate: `SITE_PASSWORD`, sent as `x-site-password` (never `Authorization`, which
 *   `/api/v1` reads for Clerk bearer tokens).
 *
 * No Playwright import, so the deploy scripts can use it too.
 */
export function gateHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const headers: Record<string, string> = {}
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID
    headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET
  }
  if (env.SITE_PASSWORD) headers['x-site-password'] = env.SITE_PASSWORD
  return headers
}

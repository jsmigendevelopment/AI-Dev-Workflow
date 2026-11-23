import { expect, test as base } from '@playwright/test'

/**
 * The deployed test site and its previews can be protected (setup-cloudflare --protect). CI then
 * sets these from the GitHub environment's secrets, and every request to the site carries them:
 *
 * - Cloudflare Access: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (a service token);
 * - the password gate: `SITE_PASSWORD`, sent as `x-site-password` (never `Authorization`, which
 *   `/api/v1` reads for Clerk bearer tokens).
 *
 * Only requests to the site itself get them: never a third party such as Clerk.
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

const headers = gateHeaders()
const gated = Object.keys(headers).length > 0

/** `test` from Playwright, with the gate headers on same-origin requests when CI sets them. */
export const test = base.extend<{ gate: void }>({
  request: async ({ playwright, baseURL, request }, provide) => {
    if (!gated) return provide(request)
    const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers })
    await provide(context)
    await context.dispose()
  },
  gate: [
    async ({ context, baseURL }, provide) => {
      if (gated && baseURL) {
        const origin = new URL(baseURL).origin
        await context.route(
          (url) => url.origin === origin,
          (route) => route.continue({ headers: { ...route.request().headers(), ...headers } }),
        )
      }
      await provide()
    },
    { auto: true },
  ],
})

export { expect }

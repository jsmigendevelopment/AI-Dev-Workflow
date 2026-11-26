import { expect, test as base } from '@playwright/test'

import { gateHeaders } from './gate-headers'

// Only requests to the site itself get the protection headers: never a third party such as Clerk.
const headers = gateHeaders()
const gated = Object.keys(headers).length > 0

/** `test` from Playwright, with the gate headers on same-origin requests when the shell sets them. */
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

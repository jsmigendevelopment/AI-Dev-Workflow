import { expect, type Page } from '@playwright/test'

/** The password-gate preview's password (playwright.config.ts). A fixed test value, not a secret. */
export const E2E_PASSWORD = 'e2e-only-Password-not-a-secret-0123'

/**
 * The Access-check preview's vars (playwright.config.ts): a made-up team and AUD, and the paths
 * that need the JWT. No real Access sits in front of it, so those paths refuse everything.
 */
export const E2E_ACCESS = {
  SITE_PROTECTION: 'access',
  ACCESS_TEAM_DOMAIN: 'https://e2e-only.cloudflareaccess.com',
  ACCESS_AUD: '0123456789abcdef'.repeat(4),
  ACCESS_PATHS: '/notes,/api/v1/*,/_serverFn/*',
}

/** Every route a visitor can open. The 404 page is a route too. */
export const ROUTES = ['/', '/notes', '/this-page-does-not-exist'] as const

/** Waits until React has hydrated the page and the router is idle. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const router = (window as { __TSR_ROUTER__?: { state: { status: string } } }).__TSR_ROUTER__
    const header = document.querySelector('header')
    return (
      router?.state.status === 'idle' &&
      !!header &&
      Object.keys(header).some((k) => k.startsWith('__reactFiber'))
    )
  })
}

/** Collects CSP violations, console errors and uncaught errors for the life of the page. */
export function watchProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return {
    async expectNone() {
      const violations = await page.evaluate(() => (window as { __csp?: string[] }).__csp ?? [])
      expect([...problems, ...violations]).toEqual([])
    },
  }
}

/** Records `securitypolicyviolation` events from the very first script on. */
export async function recordCspViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = ((window as { __csp?: string[] }).__csp = [])
    document.addEventListener('securitypolicyviolation', (e) =>
      seen.push(`csp: ${e.violatedDirective} ${e.blockedURI}`),
    )
  })
}

/** Client-side navigation through the app's own router (what a click does after hydration). */
export async function navigate(page: Page, to: string) {
  await page.evaluate(
    (path) =>
      (
        window as { __TSR_ROUTER__?: { navigate: (o: { to: string }) => Promise<void> } }
      ).__TSR_ROUTER__!.navigate({
        to: path,
      }),
    to,
  )
}

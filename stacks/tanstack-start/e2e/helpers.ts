import { type APIRequestContext, expect, type Page } from '@playwright/test'

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

/**
 * Paths a router could take for `/api/v1/notes` while the path guards don't (#18): other case,
 * an empty segment, a trailing slash, an escaped letter or digit. Each must be a 404 or get
 * every guard.
 */
export const API_LOOKALIKES = [
  '/API/v1/notes',
  '/api/V1/notes',
  '/api//v1/notes',
  '/api/v1/notes/',
  '/%61pi/v1/notes',
  '/api/v%31/notes',
] as const

/**
 * Paths Start resolves to another one than the raw path the guards compare (#18): an escaped
 * server function base, a trailing escaped space or tab. Each gets the guards' plain 404.
 */
export const RESOLVED_ELSEWHERE = [
  '/%5FserverFn/00000000',
  '/_server%46n/00000000',
  '/notes%20',
  '/notes%20%20',
  '/notes%09',
  '/api/v1/notes%20',
] as const

/** The guards' plain 404, before Access, CSRF or a server function runs. */
export async function expectGuard404(request: APIRequestContext, baseURL: string, path: string) {
  const sameOrigin = { origin: new URL(baseURL).origin, 'sec-fetch-site': 'same-origin' }
  const response = await request.get(path, { headers: sameOrigin, maxRedirects: 0 })
  expect(response.status()).toBe(404)
  expect(await response.text()).toBe('Not found\n')
}

/** Every route a visitor can open. The 404 page is a route too; a note's page uses a made-up id. */
export const ROUTES = [
  '/',
  '/notes',
  '/notes/00000000-0000-4000-8000-000000000000',
  '/this-page-does-not-exist',
] as const

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

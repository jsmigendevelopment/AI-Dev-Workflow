import { defineConfig, devices } from '@playwright/test'
import { E2E_PASSWORD } from './e2e/helpers'

const port = 4173
// Optional: point at a browser you already have instead of `playwright install`.
const launchOptions = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined }
// Set by the deploy workflows: test a deployed URL instead of a local build (`pnpm test:deployed`,
// or `pnpm test:coming-soon` while production is not launched).
const deployed = process.env.BASE_URL?.replace(/\/$/, '')
const local = (p: number) => `http://localhost:${p}`

// The same build, previewed three ways. `CLOUDFLARE_INCLUDE_PROCESS_ENV` makes the preview read
// these vars on top of wrangler.jsonc's top level (where LAUNCHED is "true", protection "none").
const variant = (p: number, vars: Record<string, string>) => ({
  command: `pnpm preview --port ${p} --strictPort`,
  url: local(p),
  reuseExistingServer: false,
  timeout: 60_000,
  env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', ...vars },
})

const SPECIAL = /(coming-soon|site-gate)\.spec\.ts/

// Runs against the production build, served by the Cloudflare Vite plugin's preview (workerd).
// No keys are needed: the tests check that the app fails closed without a session.
// Two profiles, a desktop and a phone: the axe suite runs every route in both, in both themes.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: deployed ?? local(port),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }, testIgnore: SPECIAL },
    // Request-level checks (headers, limits, metadata) don't depend on the device: desktop only.
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions }, testMatch: /(a11y|smoke)\.spec\.ts/ },
    // Not launched: the "Coming soon" page (src/lib/launch.ts), on a desktop and a phone.
    ...(['Desktop Chrome', 'Pixel 7'] as const).map((device) => ({
      name: device === 'Pixel 7' ? 'coming-soon-phone' : 'coming-soon',
      use: { ...devices[device], launchOptions, baseURL: deployed ?? local(port + 1) },
      testMatch: /coming-soon\.spec\.ts/,
    })),
    // The password gate (src/lib/site-gate.ts): local only, with a fixed test password.
    ...(deployed
      ? []
      : [
          {
            name: 'password',
            use: { ...devices['Desktop Chrome'], launchOptions, baseURL: local(port + 2) },
            testMatch: /site-gate\.spec\.ts/,
          },
        ]),
  ],
  webServer: deployed
    ? undefined
    : [
        {
          command: `pnpm build && pnpm preview --port ${port} --strictPort`,
          url: local(port),
          reuseExistingServer: false,
          timeout: 120_000,
        },
        variant(port + 1, { LAUNCHED: 'false' }),
        variant(port + 2, { SITE_PROTECTION: 'password', SITE_PASSWORD: E2E_PASSWORD }),
      ],
})

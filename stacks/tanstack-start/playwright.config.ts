import { defineConfig, devices } from '@playwright/test'

import { E2E_APP, e2eClerkVars } from './e2e/clerk-tokens'
import { E2E_ACCESS, E2E_PASSWORD } from './e2e/helpers'

const port = 4173
// Optional: point at a browser you already have instead of `playwright install`.
const launchOptions = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined }
// Set by the deploy workflows: test a deployed URL instead of a local build (`pnpm test:deployed`,
// or `pnpm test:coming-soon` while production is not launched).
const deployed = process.env.BASE_URL?.replace(/\/$/, '')
const local = (p: number) => `http://localhost:${p}`

// The same build, previewed six ways. `CLOUDFLARE_INCLUDE_PROCESS_ENV` makes the preview read
// these vars on top of wrangler.jsonc's top level (where LAUNCHED is "true", protection "none").
const variant = (p: number, vars: Record<string, string>) => ({
  command: `pnpm preview --port ${p} --strictPort`,
  url: local(p),
  reuseExistingServer: false,
  timeout: 60_000,
  env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', ...vars },
})

const SPECIAL = /(access-check|clerk-native|clerk-parties|coming-soon|site-gate|visual)\.spec\.ts/
// The screenshot tests run only through `pnpm test:visual` (scripts/test-visual.ts sets VISUAL).
const visual = !!process.env.VISUAL && !deployed

// Runs against the production build, served by the Cloudflare Vite plugin's preview (workerd).
// No keys are needed: the tests check that the app fails closed without a session.
// Two profiles, a desktop and a phone: the axe suite runs every route in both, in both themes.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  // CI never writes a baseline: a missing or different screenshot fails.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  // One path for every system: baselines are made in Playwright's Linux image (see test-visual.ts).
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' } },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: deployed ?? local(port),
    trace: 'retain-on-failure',
  },
  projects: visual
    ? [
        {
          name: 'visual-desktop',
          use: { ...devices['Desktop Chrome'], launchOptions },
          testMatch: /visual\.spec\.ts/,
        },
        {
          name: 'visual-phone',
          use: { ...devices['Pixel 7'], launchOptions },
          testMatch: /visual\.spec\.ts/,
        },
      ]
    : [
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
              // The Worker's Access JWT check (src/lib/access-jwt.ts): local only, no real Access.
              {
                name: 'access',
                use: { ...devices['Desktop Chrome'], launchOptions, baseURL: local(port + 3) },
                testMatch: /access-check\.spec\.ts/,
              },
              // Clerk's authorizedParties (src/lib/authorized-parties.ts): a made-up instance whose
              // tokens the tests sign themselves (e2e/clerk-tokens.ts).
              {
                name: 'clerk',
                use: { ...devices['Desktop Chrome'], launchOptions, baseURL: local(port + 4) },
                testMatch: /clerk-parties\.spec\.ts/,
              },
              // The same with CLERK_ALLOW_NATIVE_TOKENS on and the app claim, as the monorepo-expo
              // pack sets them, and the publishable key under its old name (the alias).
              {
                name: 'clerk-native',
                use: { ...devices['Desktop Chrome'], launchOptions, baseURL: local(port + 5) },
                testMatch: /clerk-native\.spec\.ts/,
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
        ...(visual
          ? []
          : [
              variant(port + 1, { LAUNCHED: 'false' }),
              variant(port + 2, { SITE_PROTECTION: 'password', SITE_PASSWORD: E2E_PASSWORD }),
              variant(port + 3, E2E_ACCESS),
              // Signed-in calls read the notes table: migrate the local D1 first.
              {
                ...variant(port + 4, {
                  ...e2eClerkVars(),
                  CLERK_TELEMETRY_DISABLED: '1',
                  CLERK_NATIVE_APP_CLAIM: E2E_APP,
                }),
                command: `pnpm db:migrate:local && pnpm preview --port ${port + 4} --strictPort`,
              },
              // The old key name, so the alias (src/lib/env-schema.ts) is proved on a built Worker.
              variant(port + 5, {
                ...e2eClerkVars('CLERK_PUBLISHABLE_KEY'),
                CLERK_TELEMETRY_DISABLED: '1',
                CLERK_ALLOW_NATIVE_TOKENS: 'true',
                CLERK_NATIVE_APP_CLAIM: E2E_APP,
              }),
            ]),
      ],
})

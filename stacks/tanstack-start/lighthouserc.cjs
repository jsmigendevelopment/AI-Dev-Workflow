// Lighthouse CI: `pnpm build && pnpm lhci` (Chrome from CHROME_PATH, or Playwright's Chromium).
// Local and opt-in: each run takes a minute or two. Mobile emulation (Lighthouse's default: a
// mid-range phone, slow 4G, 4x CPU), 3 runs, median timings, worst CLS.
//
// It serves the production build with `wrangler dev` on the built config: the same workerd
// runtime and headers as production, and compressed responses (`vite preview` sends JS
// uncompressed, which makes Lighthouse overstate transfer and LCP). Never special-case
// Lighthouse's user agent: it would measure a site nobody gets.
const port = Number(process.env.LHCI_PORT ?? 4392)
const base = `http://localhost:${port}`

const strict = {
  'categories:performance': ['error', { minScore: 0.95 }],
  'categories:accessibility': ['error', { minScore: 1 }],
  'categories:best-practices': ['error', { minScore: 1 }],
  'categories:seo': ['error', { minScore: 1 }],
  'largest-contentful-paint': ['error', { maxNumericValue: 2000, aggregationMethod: 'median' }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.01, aggregationMethod: 'max' }],
  'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],
  // No third-party origin on any page; the script transfer stays inside the JS budget.
  // Lighthouse 13 replaced `third-party-summary`: asserting the old id passes without checking.
  'third-parties-insight': ['error', { maxLength: 0 }],
  'resource-summary:script:size': ['error', { maxNumericValue: 180 * 1024 }],
}

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm exec wrangler dev -c dist/server/wrangler.json --port ${port}`,
      startServerReadyPattern: 'Ready on',
      startServerReadyTimeout: 60_000,
      url: [`${base}/`, `${base}/notes`],
      numberOfRuns: 3,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertMatrix: [
        { matchingUrlPattern: `^${base}/$`, assertions: strict },
        // An app page behind sign-in is noindex on purpose, so the SEO score is not asserted.
        {
          matchingUrlPattern: `^${base}/notes$`,
          assertions: { ...strict, 'categories:seo': 'off', 'resource-summary:script:size': 'off' },
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci/reports' },
  },
}

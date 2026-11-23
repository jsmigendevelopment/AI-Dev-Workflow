import { expect, test } from '@playwright/test'

import { hydrated, ROUTES } from './helpers'

// Screenshot tests: every route, in both themes, on the desktop and phone projects
// (`pnpm test:visual`). A pixel change beyond the tolerance in playwright.config.ts fails; the
// report shows expected, actual and the diff. After an intended change: `pnpm test:visual --update`,
// look at every new PNG, and commit them with the change.
const name = (path: string) => (path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'))

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const path of ROUTES) {
      test(`${path} looks the same`, async ({ page }) => {
        await page.goto(path)
        await hydrated(page)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page).toHaveScreenshot(`${name(path)}-${theme}.png`, { fullPage: true })
      })
    }
  })
}

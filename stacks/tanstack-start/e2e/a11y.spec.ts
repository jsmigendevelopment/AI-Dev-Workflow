import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'

import { expect, test } from './gate'
import { hydrated, navigate, ROUTES } from './helpers'

// WCAG 2.2 AA. `wcag22aa` is what turns on axe's target-size rule.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function expectNoViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS)
  if (include) builder.include(include)
  const { violations } = await builder.analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

/**
 * Serves the notes server functions from the test: an empty list, and a create that `answer`s.
 * A plain JSON body reaches the caller as `body.result`, or is thrown as `body.error` (that is
 * how Start's client reads a response it did not serialize; the request guards answer this way).
 */
async function fakeNotesServer(page: Page, answer: unknown, status = 200) {
  await page.route('**/_serverFn/**', (route) =>
    route.fulfill({
      status: route.request().method() === 'GET' ? 200 : status,
      json:
        route.request().method() === 'GET'
          ? { result: { ok: true, data: { items: [], nextCursor: null } } }
          : answer,
    }),
  )
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const path of ROUTES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path)
        await hydrated(page)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expectNoViolations(page)
      })
    }

    test('the note form in its error states has no axe violations', async ({ page }) => {
      await fakeNotesServer(page, {
        result: {
          ok: false,
          error: {
            code: 'validation',
            message: 'Some fields need attention.',
            fields: { title: ['Taken.'] },
          },
        },
      })
      await page.goto('/')
      await hydrated(page)
      await navigate(page, '/notes')
      const title = page.getByLabel('New note title')
      await expect(title).toBeVisible()

      // Client-side error: empty submit. The field is marked, described and focused.
      await page.getByRole('button', { name: 'Add' }).click()
      await expect(title).toBeFocused()
      await expect(title).toHaveAttribute('aria-invalid', 'true')
      await expect(title).toHaveAccessibleDescription('Give the note a title.')
      await expectNoViolations(page, 'main')

      // Server-side field error: same pattern, the server's message.
      await title.fill('Groceries')
      await page.getByRole('button', { name: 'Add' }).click()
      await expect(title).toHaveAccessibleDescription('Taken.')
      await expect(title).toBeFocused()
      await expectNoViolations(page, 'main')
    })

    test('a form-level failure is announced in the alert region', async ({ page }) => {
      // The rate limiter's own answer, before any server function runs.
      await fakeNotesServer(
        page,
        { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
        429,
      )
      await page.goto('/')
      await hydrated(page)
      await navigate(page, '/notes')
      const alert = page.getByRole('alert')
      await expect(alert).toBeAttached() // present before it has anything to say
      await page.getByLabel('New note title').fill('Groceries')
      await page.getByRole('button', { name: 'Add' }).click()
      await expect(alert).toHaveText('Too many requests.')
      await expectNoViolations(page, 'main')
    })

    test('hover and focus states keep their contrast', async ({ page }) => {
      await page.goto('/')
      await hydrated(page)
      for (const target of await page
        .locator('main a:visible, main button:visible, header a:visible')
        .all()) {
        await target.hover()
        await target.focus()
        const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        expect(violations.map((v) => v.id)).toEqual([])
      }
    })
  })
}

test('the skip link is the first stop and moves focus to the content', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard path')
  await page.goto('/')
  await hydrated(page)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('focus is a visible outline, so it survives forced colors', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard path')
  await page.goto('/')
  await hydrated(page)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const style = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(style).toBe('solid')
})

test('a client-side navigation moves focus to the new page heading', async ({ page }) => {
  await fakeNotesServer(page, { result: { ok: true, data: {} } })
  await page.goto('/notes')
  await hydrated(page)
  await navigate(page, '/')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
})

test('reduced motion: nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await hydrated(page)
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === 'running').length,
  )
  expect(running).toBe(0)
})

test('reflows at 320 by 256 (400% zoom) with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 })
  for (const path of ROUTES) {
    await page.goto(path)
    await hydrated(page)
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(fits, path).toBe(true)
  }
})

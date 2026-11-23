import type { Page, Route } from '@playwright/test'

import { expect, test } from './gate'
import { hydrated } from './helpers'

// The notes UI end to end, signed in. There are no Clerk keys in e2e, so the test plays the
// server: every server function call goes through `fake`. The first render comes from a client
// navigation (the server render has no session). A plain JSON body reaches the caller as
// `body.result` (see fakeNotesServer in a11y.spec.ts).

interface Note {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
const note = (n: number, title = `Note ${n}`): Note => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  title,
  createdAt: Date.UTC(2026, 10, n),
  updatedAt: Date.UTC(2026, 10, n),
})
const ok = (data: unknown) => ({ result: { ok: true, data } })
const failed = (code: string, message: string) => ({ result: { ok: false, error: { code, message } } })

/** What the page asked for: the decoded payload of a GET, or the body of a POST. */
const input = (route: Route) =>
  route.request().method() === 'GET'
    ? decodeURIComponent(new URL(route.request().url()).searchParams.get('payload') ?? '')
    : (route.request().postData() ?? '')

type Answer = (route: Route, asked: string) => unknown

/** Routes each kind of call to its own answer; `calls` records every list request's payload. */
async function fake(page: Page, answers: { list?: Answer; get?: Answer; write?: Answer }) {
  const calls: string[] = []
  await page.route('**/_serverFn/**', async (route) => {
    const asked = input(route)
    const kind = route.request().method() === 'POST' ? 'write' : asked.includes('"limit"') ? 'list' : 'get'
    if (kind === 'list') calls.push(asked)
    const answer = answers[kind]
    const json = answer ? await answer(route, asked) : ok({ items: [], nextCursor: null })
    await route.fulfill({ json })
  })
  return calls
}

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** Loads the app, then navigates on the client without waiting for it (so pending states show). */
async function open(page: Page, href: string) {
  await page.goto('/')
  await hydrated(page)
  await page.evaluate((to) => {
    const router = (window as { __TSR_ROUTER__?: { navigate: (o: { href: string }) => Promise<void> } })
      .__TSR_ROUTER__!
    void router.navigate({ href: to })
  }, href)
}

test.describe('the list keeps its filter, order and page count in the URL', () => {
  test('a link with ?q=&sort= opens that list, and the controls write back to the URL', async ({ page }) => {
    const calls = await fake(page, { list: () => ok({ items: [note(1, 'Milk')], nextCursor: null }) })
    await open(page, '/notes?q=milk&sort=oldest')
    await expect(page.getByRole('link', { name: 'Milk' })).toBeVisible()
    expect(calls.at(-1)).toContain('milk')
    expect(calls.at(-1)).toContain('oldest')
    await expect(page.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('milk')
    await expect(page.getByRole('link', { name: 'Oldest' })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('link', { name: 'Newest' }).click()
    await expect(page).toHaveURL(/\/notes\?q=milk$/) // the default order is left out of the URL

    await page.getByRole('searchbox', { name: 'Search notes' }).fill('bread')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\/notes\?q=bread$/)
    expect(calls.at(-1)).toContain('bread')
  })

  test('bad values fall back to the defaults instead of breaking the page', async ({ page }) => {
    await fake(page, { list: () => ok({ items: [note(1)], nextCursor: null }) })
    await open(page, '/notes?sort=sideways&page=lots')
    await expect(page.getByRole('link', { name: 'Note 1' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Newest' })).toHaveAttribute('aria-current', 'page')
  })

  test('"Load more" counts pages in the URL', async ({ page }) => {
    await fake(page, {
      list: (_, asked) =>
        asked.includes('"cursor"') && asked.includes('c1')
          ? ok({ items: [note(1)], nextCursor: null })
          : ok({ items: [note(2)], nextCursor: 'c1' }),
    })
    await open(page, '/notes')
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByRole('link', { name: 'Note 1' })).toBeVisible()
    await expect(page).toHaveURL(/\/notes\?page=2$/)
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)
  })
})

test.describe('optimistic writes and refresh states', () => {
  test('a delete shows at once, rolls back when refused, and the toast has a reference', async ({ page }) => {
    await fake(page, {
      list: () => ok({ items: [note(2), note(1)], nextCursor: null }),
      write: () => later(800, failed('forbidden', 'You can’t delete this note.')),
    })
    await open(page, '/notes')
    const row = page.getByRole('link', { name: 'Note 2' })
    await expect(row).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expect(row).toHaveCount(0) // gone before the server answers

    const toast = page.getByRole('alert').filter({ hasText: 'Couldn’t delete the note' })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('You can’t delete this note.')
    await expect(toast).toContainText(/Reference: [0-9a-f]{8}/)
    await expect(row).toBeVisible() // rolled back
    await toast.getByRole('button', { name: 'Dismiss' }).click()
    await expect(toast).toHaveCount(0)
  })

  test('a rename shows at once, then "Updating…" while the list refetches', async ({ page }) => {
    let title = 'Draft'
    await fake(page, {
      list: async () =>
        later(title === 'Draft' ? 0 : 1000, ok({ items: [note(1, title)], nextCursor: null })),
      write: () => {
        title = 'Final'
        return ok(note(1, 'Final'))
      },
    })
    await open(page, '/notes')
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Final')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('link', { name: 'Final' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Updating…' })).toBeVisible()
    await expect(page.getByText('Updating…')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Final' })).toBeVisible()
  })

  test('a failed refetch keeps the data with a banner, and Retry recovers', async ({ page }) => {
    let down = false
    await fake(page, {
      list: () => (down ? failed('forbidden', 'Not now.') : ok({ items: [note(1)], nextCursor: null })),
      write: () => {
        down = true
        return ok(note(1, 'Renamed'))
      },
    })
    await open(page, '/notes')
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Renamed')
    await page.getByRole('button', { name: 'Save' }).click()
    const banner = page.getByRole('alert').filter({ hasText: 'Couldn’t refresh.' })
    await expect(banner).toContainText(/Showing data from \d/)
    await expect(page.getByRole('link', { name: 'Renamed' })).toBeVisible() // the data stays

    down = false
    await banner.getByRole('button', { name: 'Retry' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Note 1' })).toBeVisible()
  })

  test('a slow navigation shows the page skeleton instead of a blank page', async ({ page }) => {
    await fake(page, { list: () => later(1500, ok({ items: [note(1)], nextCursor: null })) })
    await open(page, '/notes')
    await expect(page.locator('main [aria-busy="true"]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Note 1' })).toBeVisible()
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
  })
})

test.describe('a note’s own page', () => {
  test('shows the note, then streams "More notes" in', async ({ page }) => {
    await fake(page, {
      get: () => ok(note(2, 'Groceries')),
      list: () => later(600, ok({ items: [note(3), note(2, 'Groceries')], nextCursor: null })),
    })
    await open(page, `/notes/${note(2).id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible()
    await expect(page.getByText('Loading more notes…')).toBeAttached()
    await expect(page.getByRole('link', { name: 'Note 3' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Groceries' })).toHaveCount(0) // not itself
  })

  test('a list title links to the note through the typed route', async ({ page }) => {
    await fake(page, {
      list: () => ok({ items: [note(4, 'Linked')], nextCursor: null }),
      get: () => ok(note(4, 'Linked')),
    })
    await open(page, '/notes')
    await page.getByRole('link', { name: 'Linked' }).click()
    await expect(page).toHaveURL(new RegExp(`/notes/${note(4).id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Linked' })).toBeVisible()
  })

  test('a UUID that is not your note gets the designed not-found state', async ({ page }) => {
    await fake(page, { get: () => failed('not_found', 'That note does not exist.') })
    await open(page, `/notes/${note(9).id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Note not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to your notes' }).click()
    await expect(page).toHaveURL(/\/notes$/)
  })

  test('a path that is not a UUID is the app’s 404, with status 404', async ({ page }) => {
    const response = await page.goto('/notes/not-a-uuid')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  })

  test('signed out, the page asks you to sign in', async ({ page }) => {
    await page.goto(`/notes/${note(1).id}`)
    await expect(page.getByText('Sign in to see this note')).toBeVisible()
  })
})

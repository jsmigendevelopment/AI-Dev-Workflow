import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

import { packagedExecutable } from '../scripts/packaged.ts'

// Each test starts the packaged app on a data folder of its own, so none touches the user folder's.
const opened: { app: ElectronApplication; dataDir: string }[] = []

async function openPreferences(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: packagedExecutable('out-e2e'),
    env: { ...process.env, APP_DATA_DIR: dataDir },
    timeout: 30_000,
  })
  opened.push({ app, dataDir })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Preferences' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible()
  return { app, page }
}

const freshDataDir = () => mkdtempSync(path.join(tmpdir(), 'app-e2e-preferences-'))
const pageSize = (page: Page) => page.getByLabel('Rows per page')
const refresh = (page: Page) => page.getByLabel('Refresh every')
const save = (page: Page) => page.getByRole('button', { name: 'Save preferences' })
const noAxeViolations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations
}

test.afterEach(async () => {
  for (const { app, dataDir } of opened.splice(0)) {
    await app.close()
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('WHEN Preferences opens on a fresh data folder THEN the defaults show: 25 rows and 30 seconds', async () => {
  const { page } = await openPreferences(freshDataDir())
  await expect(pageSize(page)).toHaveValue('25')
  await expect(refresh(page)).toHaveValue('30')
})

test('WHEN Rows per page is set to 50 and saved THEN, after the app restarts on the same data folder, it shows 50', async () => {
  const dataDir = freshDataDir()
  const first = await openPreferences(dataDir)
  await pageSize(first.page).fill('50')
  await save(first.page).click()
  await expect(first.page.getByRole('status').filter({ hasText: 'Preferences saved.' })).toBeVisible()
  await first.app.close()
  opened.splice(0)
  const second = await openPreferences(dataDir)
  await expect(pageSize(second.page)).toHaveValue('50')
  await expect(refresh(second.page)).toHaveValue('30')
})

test('WHEN a value is out of range THEN Save shows the field error, focuses the field and stores nothing', async () => {
  const dataDir = freshDataDir()
  const { app, page } = await openPreferences(dataDir)
  const cases = [
    { pageSize: '5', refresh: '30', field: pageSize, message: 'Enter a whole number from 10 to 100.' },
    {
      pageSize: '25',
      refresh: '301',
      field: refresh,
      message: 'Enter a whole number of seconds from 5 to 300.',
    },
  ]
  for (const c of cases) {
    await pageSize(page).fill(c.pageSize)
    await refresh(page).fill(c.refresh)
    await save(page).click()
    const field = c.field(page)
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription(c.message)
    await expect(field).toBeFocused()
  }
  expect(await noAxeViolations(page)).toEqual([])
  await app.close()
  opened.splice(0)
  const again = await openPreferences(dataDir)
  await expect(pageSize(again.page)).toHaveValue('25')
  await expect(refresh(again.page)).toHaveValue('30')
})

test('WHEN preferences.get fails THEN Preferences shows the designed error state with its reference ID and Try again', async () => {
  const dataDir = freshDataDir()
  // Not a SQLite file, so the engine can't open it and preferences.get answers data_unreadable.
  writeFileSync(path.join(dataDir, 'app.db'), 'this is not a database file, on purpose')
  const { page } = await openPreferences(dataDir)
  const alert = page.getByRole('alert').filter({ hasText: 'Preferences couldn’t load' })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('The app could not read its data file.')
  await expect(alert).toContainText(/Reference REF-[0-9a-f]{6}/)
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    expect(await noAxeViolations(page), scheme).toEqual([])
  }
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Preferences couldn’t load' })).toBeVisible()
})

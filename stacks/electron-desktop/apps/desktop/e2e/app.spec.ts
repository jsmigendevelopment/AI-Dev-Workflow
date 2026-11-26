import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { APP_NAME } from '@app/contract/app'
import type { AppApi } from '@app/contract/preload-api'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

import { packagedExecutable } from '../scripts/packaged.ts'

let app: ElectronApplication
let page: Page
// A data folder of its own, so the run never writes into the user folder.
const dataDir = mkdtempSync(path.join(tmpdir(), 'app-e2e-'))
const APP_URL = `app://${APP_NAME}/`
const healthGet = () =>
  page.evaluate(() => (globalThis as typeof globalThis & { app: AppApi }).app.send('health.get'))

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: packagedExecutable('out-e2e'),
    env: { ...process.env, APP_DATA_DIR: dataDir },
    timeout: 30_000,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('load')
})

test.afterAll(async () => {
  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
})

test('WHEN the packaged e2e flavour opens THEN a window shows the app name', async () => {
  await expect(page.getByRole('banner').getByText(APP_NAME, { exact: true })).toBeVisible()
})

test('WHEN the window is created THEN its webPreferences have contextIsolation, sandbox and no nodeIntegration', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    // Electron has no public getter for a window's preferences; this internal one is what it applied.
    const contents = BrowserWindow.getAllWindows()[0]?.webContents as
      (Electron.WebContents & { getLastWebPreferences(): Electron.WebPreferences | null }) | undefined
    const p = contents?.getLastWebPreferences()
    return { contextIsolation: p?.contextIsolation, sandbox: p?.sandbox, nodeIntegration: p?.nodeIntegration }
  })
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false })
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined')
})

test('WHEN the page requests or checks a permission THEN it is denied', async () => {
  const result = await page.evaluate(async () => ({
    check: (await navigator.permissions.query({ name: 'geolocation' })).state,
    request: await Notification.requestPermission(),
  }))
  expect(result).toEqual({ check: 'denied', request: 'denied' })
})

test('WHEN the packaged screen loads THEN it comes from app:// with a CSP header that allows no remote origin', async () => {
  expect(page.url()).toBe(APP_URL)
  const csp = await page.evaluate(async () =>
    (await fetch(location.href)).headers.get('content-security-policy'),
  )
  expect(csp).toContain("default-src 'self'")
  expect(csp).not.toMatch(/https?:|\*/)
})

test('WHEN the screen tries to navigate the main window away from app:// THEN the navigation is blocked', async () => {
  await page.evaluate(() => {
    location.href = 'https://example.com/'
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(APP_URL)
  const opened = await page.evaluate((url) => window.open(url) === null, APP_URL)
  expect(opened).toBe(true)
  expect(app.windows()).toHaveLength(1)
})

test('WHEN the packaged app starts THEN main starts the engine with utilityProcess and health.get over IPC returns engine "running"', async () => {
  expect(await healthGet()).toMatchObject({
    ok: true,
    data: { engine: 'running', flavour: 'e2e', data: { folder: dataDir } },
  })
  const utilities = await app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      .filter((metric) => metric.type === 'Utility')
      .map((metric) => metric.name),
  )
  expect(utilities).toContain(`${APP_NAME} engine`)
  expect(readdirSync(path.join(dataDir, 'logs'))).toEqual([
    `app-${new Date().toISOString().slice(0, 10)}.log`,
  ])
})

test('WHEN the packaged app starts THEN the engine opens app.db in the data folder and health.get says data ok with its driver', async () => {
  expect(await healthGet()).toMatchObject({
    ok: true,
    data: { data: { isOk: true, folder: dataDir, driver: 'node:sqlite' } },
  })
  expect(existsSync(path.join(dataDir, 'app.db'))).toBe(true)
})

import path from 'node:path'

import { APP_NAME } from '@app/contract/app'
import { app, BrowserWindow } from 'electron'

import { APP_USER_MODEL_ID } from './app-id'
import type { MainComposition } from './composition'
import { composeMain } from './composition'
import { engineHealth, isHealthy } from './engine-link'
import { setAppMenu } from './menu'
import { APP_ORIGIN } from './security/app-protocol'
import { hardenApp, registerAppScheme, serveApp } from './security/harden'
import { secureWebPreferences } from './security/web-preferences'
import { exitAfterFirstLoad } from './smoke'
import { handleSquirrelEvent } from './squirrel'

// Squirrel starts the app while it installs or removes shortcuts on Windows: quit at once then.
if (handleSquirrelEvent(process.argv, process.execPath)) app.quit()
app.setAppUserModelId(APP_USER_MODEL_ID)
registerAppScheme()
hardenApp(MAIN_WINDOW_VITE_DEV_SERVER_URL)

function createWindow(main: MainComposition): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_NAME,
    webPreferences: secureWebPreferences(path.join(__dirname, 'preload.cjs')),
  })
  main.trustWindow(window)
  void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL ? MAIN_WINDOW_VITE_DEV_SERVER_URL : `${APP_ORIGIN}/`)
  return window
}

void app.whenReady().then(() => {
  serveApp(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`))
  const main = composeMain(__dirname, MAIN_WINDOW_VITE_DEV_SERVER_URL)
  const window = createWindow(main)
  setAppMenu(main.engine)
  if (process.argv.includes('--smoke')) {
    exitAfterFirstLoad(
      window.webContents,
      async () => isHealthy(await engineHealth(main.engine)),
      (code) => app.exit(code),
    )
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(main)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

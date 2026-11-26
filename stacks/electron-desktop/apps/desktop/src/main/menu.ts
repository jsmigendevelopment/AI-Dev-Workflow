import { APP_NAME } from '@app/contract/app'
import { app, dialog, Menu } from 'electron'

import { aboutText } from './about'
import type { EngineLink } from './engine-link'
import { engineHealth } from './engine-link'

async function showAbout(engine: EngineLink): Promise<void> {
  const health = await engineHealth(engine)
  await dialog.showMessageBox({
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: aboutText(
      { version: app.getVersion(), commit: BUILD_COMMIT, flavour: BUILD_FLAVOUR },
      health ?? null,
    ),
  })
}

/** The app menu: the default roles plus Help > About, which asks the engine whether it runs and its data file opened. */
export function setAppMenu(engine: EngineLink): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      { label: 'Help', submenu: [{ label: `About ${APP_NAME}`, click: () => void showAbout(engine) }] },
    ]),
  )
}

import { homedir } from 'node:os'
import path from 'node:path'

import { APP_NAME } from '@app/contract/app'
import type { EventEnvelope } from '@app/contract/events'
import { EVENT_CHANNEL } from '@app/contract/events'
import { resolveDataDir } from '@app/engine/lib/data-dir'
import type { BrowserWindow } from 'electron'
import { app, ipcMain, utilityProcess, webContents } from 'electron'

import type { EngineLink } from './engine-link'
import { createEngineLink } from './engine-link'
import { isAppFrame, registerIpc, senderOf } from './ipc/register'
import { createMainLogger } from './logger'
import { APP_ORIGIN } from './security/app-protocol'

/** What main builds at start: the engine link, and a way to mark a window as the app's own. */
export interface MainComposition {
  engine: EngineLink
  trustWindow(window: BrowserWindow): void
}

/** Sends an event to the app's own windows only, the same ones allowed to send commands. */
function toAppWindows(ids: Set<number>, event: EventEnvelope): void {
  for (const id of ids) webContents.fromId(id)?.send(EVENT_CHANNEL, event)
}

/**
 * Starts the engine in Electron's utilityProcess and carries commands to it over IPC. Only the top
 * frame of a window passed to `trustWindow`, showing the app's own address, may send.
 */
export function composeMain(buildDir: string, devServerUrl: string | undefined): MainComposition {
  const build = { version: app.getVersion(), commit: BUILD_COMMIT, flavour: BUILD_FLAVOUR }
  const appWindowIds = new Set<number>()
  const log = createMainLogger(resolveDataDir(process.env, homedir()), () => new Date())
  const child = utilityProcess.fork(path.join(buildDir, 'engine-process.cjs'), [JSON.stringify(build)], {
    serviceName: `${APP_NAME} engine`,
  })
  const engine = createEngineLink(child, (event) => toAppWindows(appWindowIds, event))
  // Commands main answers itself because they need Electron (a native box, a window) go in here.
  const mainHandlers = {}
  const prefixes = [`${APP_ORIGIN}/`, ...(devServerUrl ? [`${new URL(devServerUrl).origin}/`] : [])]
  const isTrusted = (event: Electron.IpcMainInvokeEvent) =>
    isAppFrame(senderOf(event, appWindowIds), prefixes)
  registerIpc(ipcMain, engine, isTrusted, mainHandlers, log)
  return {
    engine,
    trustWindow(window) {
      const id = window.webContents.id
      appWindowIds.add(id)
      window.once('closed', () => appWindowIds.delete(id))
    },
  }
}

import type { WebPreferences } from 'electron'

/**
 * The only builder of webPreferences (Electron's security checklist): the page runs isolated and
 * sandboxed, with no Node and no <webview>. Every BrowserWindow takes its preferences from here.
 */
export function secureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  }
}

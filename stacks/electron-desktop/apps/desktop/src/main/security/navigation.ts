import { APP_HOST, APP_SCHEME } from './app-protocol'
import { openExternalSafely } from './external'

/** True for the packaged screen's own app:// URLs, and for the Vite dev server's origin under `pnpm dev`. */
export function isAllowedUrl(url: string, devServerUrl: string | undefined): boolean {
  if (!URL.canParse(url)) return false
  const target = new URL(url)
  if (target.protocol === `${APP_SCHEME}:` && target.host === APP_HOST) return true
  return (
    devServerUrl !== undefined && URL.canParse(devServerUrl) && target.origin === new URL(devServerUrl).origin
  )
}

interface GuardOptions {
  open: (url: string) => Promise<void>
  devServerUrl: string | undefined
}

/** The parts of webContents the guards use, so tests can pass a stand-in. */
interface GuardedContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
  on(event: string, listener: (event: { preventDefault: () => void }, url: string) => void): unknown
}

/**
 * Keeps a page where it is: no new windows (https links go to the person's browser instead), no
 * navigation or redirect away from the app, and no <webview>.
 */
export function guardWebContents(contents: GuardedContents, options: GuardOptions): void {
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url, options.open)
    return { action: 'deny' }
  })
  const blockForeign = (event: { preventDefault: () => void }, url: string): void => {
    if (!isAllowedUrl(url, options.devServerUrl)) event.preventDefault()
  }
  contents.on('will-navigate', blockForeign)
  contents.on('will-redirect', blockForeign)
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

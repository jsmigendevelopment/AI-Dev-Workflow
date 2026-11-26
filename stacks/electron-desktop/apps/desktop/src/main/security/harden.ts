import { pathToFileURL } from 'node:url'

import { app, net, protocol, session, shell } from 'electron'

import { APP_SCHEME, CONTENT_SECURITY_POLICY, resolveAppFile } from './app-protocol'
import { guardWebContents } from './navigation'
import { denyAllPermissions } from './permissions'

/** Before ready: app:// acts like an https origin (standard, secure, fetch allowed), so 'self' means the app. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

/** Before ready: every session denies permissions, and every page gets the navigation guards. */
export function hardenApp(devServerUrl: string | undefined): void {
  const open = (url: string) => shell.openExternal(url)
  app.on('session-created', denyAllPermissions)
  app.on('web-contents-created', (_event, contents) => guardWebContents(contents, { open, devServerUrl }))
}

async function serveFile(file: string): Promise<Response> {
  const response = await net.fetch(pathToFileURL(file).toString())
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  return new Response(response.body, { status: response.status, headers })
}

/** After ready: harden the default session and serve app:// from the screen's folder, with the CSP header. */
export function serveApp(rendererDir: string): void {
  denyAllPermissions(session.defaultSession)
  session.defaultSession.protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(rendererDir, request.url)
    // A missing file rejects net.fetch; the page gets a plain 404 like any other unknown path.
    const response = file ? await serveFile(file).catch(() => null) : null
    return response ?? new Response('Not found', { status: 404 })
  })
}

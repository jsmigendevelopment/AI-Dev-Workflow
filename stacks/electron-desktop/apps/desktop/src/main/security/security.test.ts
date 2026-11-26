import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { APP_ORIGIN, CONTENT_SECURITY_POLICY, resolveAppFile } from './app-protocol'
import { openExternalSafely } from './external'
import { guardWebContents, isAllowedUrl } from './navigation'
import { denyAllPermissions } from './permissions'
import { secureWebPreferences } from './web-preferences'

const mainDir = path.resolve(__dirname, '..')

function mainFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return mainFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

type Listener = (event: { preventDefault: () => void }, url: string) => void

/** A stand-in for webContents that records the guards guardWebContents installs. */
function fakeContents() {
  const listeners = new Map<string, Listener>()
  let openHandler: ((details: { url: string }) => { action: 'deny' }) | undefined
  return {
    on: (name: string, listener: Listener) => listeners.set(name, listener),
    setWindowOpenHandler: (handler: typeof openHandler) => {
      openHandler = handler
    },
    fire(name: string, url: string): boolean {
      const preventDefault = vi.fn()
      listeners.get(name)?.({ preventDefault }, url)
      return preventDefault.mock.calls.length > 0
    },
    open: (url: string) => openHandler?.({ url }),
  }
}

describe('window and session hardening', () => {
  it('WHEN any window is created THEN its webPreferences have contextIsolation, sandbox and no nodeIntegration', () => {
    const prefs = secureWebPreferences('/app/preload.cjs')
    expect(prefs).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: '/app/preload.cjs',
    })
  })

  it('WHEN the main process source is scanned THEN webPreferences are built only in main/security/', () => {
    const outside = mainFiles(mainDir).filter((file) => !file.includes(`${path.sep}security${path.sep}`))
    for (const file of outside) {
      const text = readFileSync(file, 'utf8')
      const uses = text.match(/webPreferences\s*:[^,\n}]*/g) ?? []
      for (const use of uses) expect(use, file).toMatch(/webPreferences\s*:\s*secureWebPreferences\(/)
    }
  })

  it('WHEN the page requests or checks any permission THEN the handlers deny it', () => {
    let request: ((wc: unknown, permission: string, callback: (granted: boolean) => void) => void) | undefined
    let check: ((wc: unknown, permission: string) => boolean) | undefined
    denyAllPermissions({
      setPermissionRequestHandler: (handler) => {
        request = handler as typeof request
      },
      setPermissionCheckHandler: (handler) => {
        check = handler as typeof check
      },
    })
    for (const permission of ['media', 'notifications', 'geolocation', 'clipboard-read', 'openExternal']) {
      const callback = vi.fn()
      request?.(null, permission, callback)
      expect(callback).toHaveBeenCalledWith(false)
      expect(check?.(null, permission)).toBe(false)
    }
  })

  it('WHEN the CSP header is built THEN it allows no remote origin', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*|'unsafe-eval'/)
  })

  it('WHEN an app:// path escapes the screen folder THEN no file is served', () => {
    const root = path.resolve('/app/renderer')
    expect(resolveAppFile(root, `${APP_ORIGIN}/`)).toBe(path.join(root, 'index.html'))
    expect(resolveAppFile(root, `${APP_ORIGIN}/assets/a.js`)).toBe(path.join(root, 'assets', 'a.js'))
    expect(resolveAppFile(root, `${APP_ORIGIN}/../secret.txt`)).toBe(path.join(root, 'secret.txt'))
    expect(resolveAppFile(root, `${APP_ORIGIN}/..%2f..%2fetc%2fpasswd`)).toBeNull()
    expect(resolveAppFile(root, 'app://other/index.html')).toBeNull()
  })

  it('WHEN the external opener gets an http:, file: or javascript: URL THEN it opens nothing', async () => {
    const open = vi.fn(() => Promise.resolve())
    for (const url of ['http://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
      expect(await openExternalSafely(url, open)).toBe(false)
    }
    expect(open).not.toHaveBeenCalled()
    expect(await openExternalSafely('https://example.com/docs', open)).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('WHEN the screen tries to navigate the main window away from app:// THEN the navigation is blocked', () => {
    const contents = fakeContents()
    guardWebContents(contents, { open: () => Promise.resolve(), devServerUrl: undefined })
    expect(contents.fire('will-navigate', 'https://example.com')).toBe(true)
    expect(contents.fire('will-navigate', 'file:///etc/passwd')).toBe(true)
    expect(contents.fire('will-redirect', 'https://example.com')).toBe(true)
    expect(contents.fire('will-navigate', `${APP_ORIGIN}/index.html`)).toBe(false)
    expect(contents.fire('will-attach-webview', `${APP_ORIGIN}/index.html`)).toBe(true)
    expect(contents.open('https://example.com')).toEqual({ action: 'deny' })
    expect(contents.open(`${APP_ORIGIN}/index.html`)).toEqual({ action: 'deny' })
  })

  it('WHEN pnpm dev runs THEN only the dev server origin is allowed besides app://', () => {
    expect(isAllowedUrl('http://localhost:5173/x', 'http://localhost:5173/')).toBe(true)
    expect(isAllowedUrl('http://localhost:5174/x', 'http://localhost:5173/')).toBe(false)
    expect(isAllowedUrl('http://localhost:5173/x', undefined)).toBe(false)
  })
})

import path from 'node:path'

const desktop = path.resolve(import.meta.dirname, '..')

/** The app's name, as in packages/contract/src/app.ts (scripts/packaged.test.ts keeps the two in step). */
export const PACKAGED_NAME = 'my-app'

/** The packaged app's executable for this machine, in `out/` (release) or `out-e2e/` (e2e). */
export function packagedExecutable(outDir: 'out' | 'out-e2e'): string {
  const folder = path.join(desktop, outDir, `${PACKAGED_NAME}-${process.platform}-${process.arch}`)
  return path.join(folder, process.platform === 'win32' ? `${PACKAGED_NAME}.exe` : PACKAGED_NAME)
}

/** How to start a GUI program here: with no display on Linux (the sandbox, a server), under `xvfb-run -a`. */
export function withDisplay(command: string, args: string[]): [string, string[]] {
  return process.platform === 'linux' && !process.env['DISPLAY']
    ? ['xvfb-run', ['-a', command, ...args]]
    : [command, args]
}

/**
 * Chromium refuses to start as root without --no-sandbox (the cloud sandbox runs as root), so only a
 * root run adds it; Playwright does the same for the e2e specs. The page's own `sandbox: true` is set
 * in main/security/ either way, and a normal user's run keeps Chromium's OS sandbox.
 */
export function rootSandboxArgs(): string[] {
  return process.getuid?.() === 0 ? ['--no-sandbox'] : []
}

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { withDisplay } from './packaged.ts'

// `pnpm test:e2e`: package the e2e flavour into out-e2e/ (one fuse differs: the inspector Playwright
// needs), then run the Playwright specs against it, under xvfb-run on a Linux box with no display.
const desktop = path.resolve(import.meta.dirname, '..')
const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync(command, args, { cwd: desktop, stdio: 'inherit', env, shell: process.platform === 'win32' })

run('pnpm', ['exec', 'electron-forge', 'package'], { ...process.env, APP_BUILD: 'e2e' })
// The engine writes logs and a data file: every spec's app gets a temporary data folder, never the user folder's.
const dataDir = mkdtempSync(path.join(tmpdir(), 'app-e2e-'))
try {
  run(...withDisplay('pnpm', ['exec', 'playwright', 'test']), { ...process.env, APP_DATA_DIR: dataDir })
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}

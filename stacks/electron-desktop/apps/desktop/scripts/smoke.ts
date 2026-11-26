import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { packagedExecutable, rootSandboxArgs, withDisplay } from './packaged.ts'
import { runSmoke } from './smoke-run.ts'

// The release flavour starts with --smoke, loads its screen from app:// and exits 0 within 30 s, once
// its engine has answered health.get as running with its data file ok, and app.db is in the data folder.
// Its data folder is a temporary one.
const dataDir = mkdtempSync(path.join(tmpdir(), 'app-smoke-'))
process.env['APP_DATA_DIR'] = dataDir
const [command, args] = withDisplay(packagedExecutable('out'), ['--smoke', ...rootSandboxArgs()])
const run = await runSmoke(command, args, 30_000)
const hasDb = existsSync(path.join(dataDir, 'app.db'))
const result =
  run.ok && !hasDb ? { ok: false, detail: `${run.detail}, but no app.db in the data folder` } : run
rmSync(dataDir, { recursive: true, force: true })
process.stdout.write(`smoke: ${result.ok ? 'passed' : 'FAILED'} (${result.detail})\n`)
process.exitCode = result.ok ? 0 : 1

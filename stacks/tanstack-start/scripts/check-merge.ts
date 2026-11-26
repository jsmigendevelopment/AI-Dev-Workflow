// `pnpm check:merge`, after `pnpm check`: the checks a pull request needs before merge that
// `check` and `test:e2e` don't run. The list and its tests are in scripts/checks/.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type CheckDeps, mergeChecks, runChecks } from './checks/merge-checks.ts'

const deps: CheckDeps = {
  run(cmd, args, cwd, env) {
    const r = spawnSync(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    return Promise.resolve({
      status: r.status ?? 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr || r.error?.message || '',
    })
  },
  exists: existsSync,
  read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined),
  tempDir: () => mkdtempSync(join(tmpdir(), 'check-merge-')),
  remove: (path) => rmSync(path, { recursive: true, force: true }),
}

const root = (await deps.run('git', ['rev-parse', '--show-toplevel'])).stdout.trim() || process.cwd()
process.exit(await runChecks(mergeChecks(deps, process.cwd(), root), (line) => console.log(line)))

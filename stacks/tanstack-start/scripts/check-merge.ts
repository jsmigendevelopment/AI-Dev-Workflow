// `pnpm check:merge`, after `pnpm check`: the checks a pull request needs before merge that
// `check` and `test:e2e` don't run. The list and its tests are in scripts/checks/.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { type CheckDeps, mergeChecks, runChecks } from './checks/merge-checks.ts'

const deps: CheckDeps = {
  run(cmd, args, cwd) {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return Promise.resolve({
      status: r.status ?? 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr || r.error?.message || '',
    })
  },
  exists: existsSync,
}

const root = (await deps.run('git', ['rev-parse', '--show-toplevel'])).stdout.trim() || process.cwd()
process.exit(await runChecks(mergeChecks(deps, process.cwd(), root), (line) => console.log(line)))

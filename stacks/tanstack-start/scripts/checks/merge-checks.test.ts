import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../cloudflare/deps'
import { type CheckDeps, mergeChecks, runChecks } from './merge-checks'

interface Machine {
  /** Commands on PATH that answer `--version`; `docker` means a running daemon. */
  tools: string[]
  /** Command lines that exit 1. */
  failing: string[]
  /** `git status --porcelain migrations` after `pnpm db:generate`. */
  newMigration?: string
  files: string[]
}

function machine(over: Partial<Machine> = {}) {
  const m: Machine = { tools: [], failing: [], files: [], ...over }
  const calls: string[] = []
  const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' })
  const deps: CheckDeps = {
    run(cmd, args) {
      const line = `${cmd} ${args.join(' ')}`
      calls.push(line)
      if (args[0] === '--version' || line === 'docker info')
        return Promise.resolve(m.tools.includes(cmd) ? ok() : { status: 1, stdout: '', stderr: 'not found' })
      if (m.failing.includes(line))
        return Promise.resolve({ status: 1, stdout: '', stderr: `${cmd} said no` })
      if (line === 'git status --porcelain migrations') return Promise.resolve(ok(m.newMigration ?? ''))
      return Promise.resolve(ok())
    },
    exists: (path) => m.files.includes(path),
  }
  return { deps, calls }
}

async function report(over: Partial<Machine> = {}) {
  const { deps, calls } = machine(over)
  const lines: string[] = []
  const code = await runChecks(mergeChecks(deps, '/app', '/repo'), (l) => lines.push(l))
  return { code, calls, out: lines.join('\n') }
}

describe('pnpm check:merge', () => {
  it('runs what CI used to add on top of check, and skips with the reason what this machine lacks', async () => {
    const { code, calls, out } = await report()
    expect(code).toBe(0)
    expect(calls).toEqual(
      expect.arrayContaining([
        'pnpm check:budgets',
        'pnpm db:generate',
        'pnpm audit --audit-level=high',
        'pnpm check:licenses',
        'git -C /repo ls-files -- .clerk **/.clerk/**',
      ]),
    )
    expect(out).toContain('skip  docs/research\n      no docs/research yet')
    expect(out).toContain('skip  secret scan (gitleaks)\n      needs gitleaks or Docker')
    expect(out).toContain('skip  Semgrep community rules\n      needs semgrep or Docker')
    expect(out).toMatch(/skip {2}screenshots.*\n {6}needs Docker/)
    expect(out).toContain('Name every skipped one in the pull request.')
  })

  it('uses the tools on PATH first, then Docker, for the secret scan, Semgrep and the screenshots', async () => {
    const local = await report({ tools: ['gitleaks', 'semgrep'] })
    expect(local.calls).toContain('gitleaks detect --no-git --source /repo --redact')
    expect(local.calls).toContain(
      'semgrep scan --config p/typescript --config p/react --error --metrics=off --exclude e2e',
    )

    const docker = await report({ tools: ['docker'] })
    expect(docker.calls).toContain(
      'docker run --rm -v /repo:/repo ghcr.io/gitleaks/gitleaks:v8.18.4 detect --no-git --source /repo --redact',
    )
    expect(docker.calls).toContainEqual(
      expect.stringMatching(
        /^docker run --rm -v \/app:\/src -w \/src semgrep\/semgrep:1\.185\.0 semgrep scan /,
      ),
    )
    expect(docker.calls).toContain('pnpm test:visual --docker')
    expect(docker.out).not.toContain('skip  secret scan')
  })

  it('runs every check after a failure, and fails when any did', async () => {
    const { code, calls, out } = await report({ failing: ['pnpm audit --audit-level=high'] })
    expect(code).toBe(1)
    expect(out).toContain('fail  no high or critical advisories\n      pnpm said no')
    expect(calls).toContain('pnpm check:licenses')
    expect(out).toContain('1 failed.')
  })

  it('fails when a table changed without a migration', async () => {
    const { code, out } = await report({ newMigration: '?? migrations/0003_new.sql' })
    expect(code).toBe(1)
    expect(out).toContain('A table changed without a migration.')
  })

  it('checks docs/research from the git root, against origin/main, when the kit checker is there', async () => {
    const files = ['/repo/docs/research', '/repo/.agents/skills/research/scripts/check-research.mjs']
    const { calls, out } = await report({ files })
    expect(calls).toContain(
      'node /repo/.agents/skills/research/scripts/check-research.mjs docs/research --base origin/main',
    )
    expect(out).toContain('pass  docs/research')
  })
})

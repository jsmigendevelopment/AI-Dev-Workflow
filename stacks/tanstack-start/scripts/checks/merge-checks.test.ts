import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  /** The pnpm on PATH, and the app's package.json. */
  pnpm: string
  packageJson: string
}

function machine(over: Partial<Machine> = {}) {
  const m: Machine = {
    tools: [],
    failing: [],
    files: [],
    pnpm: '12.21.0',
    packageJson: '{ "packageManager": "pnpm@12.21.0" }',
    ...over,
  }
  const calls: string[] = []
  const removed: string[] = []
  const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' })
  const deps: CheckDeps = {
    run(cmd, args, _cwd, env = {}) {
      const vars = Object.entries(env).map(([name, value]) => `${name}=${value} `)
      const line = `${vars.join('')}${cmd} ${args.join(' ')}`
      calls.push(line)
      if (line === 'pnpm --version') return Promise.resolve(ok(`${m.pnpm}\n`))
      if (args[0] === '--version' || line === 'docker info')
        return Promise.resolve(m.tools.includes(cmd) ? ok() : { status: 1, stdout: '', stderr: 'not found' })
      if (m.failing.includes(line))
        return Promise.resolve({ status: 1, stdout: '', stderr: `${cmd} said no` })
      if (line === 'git status --porcelain migrations') return Promise.resolve(ok(m.newMigration ?? ''))
      return Promise.resolve(ok())
    },
    exists: (path) => m.files.includes(path),
    read: (path) => (path === '/app/package.json' ? m.packageJson : undefined),
    tempDir: () => '/tmp/scan-1',
    remove: (path) => void removed.push(path),
  }
  return { deps, calls, removed }
}

async function report(over: Partial<Machine> = {}) {
  const { deps, calls, removed } = machine(over)
  const lines: string[] = []
  const code = await runChecks(mergeChecks(deps, '/app', '/repo'), (l) => lines.push(l))
  return { code, calls, removed, out: lines.join('\n') }
}

/** The secret scan's copy of HEAD: a scratch index, then every file in it under the scratch folder. */
const READ_TREE = 'GIT_INDEX_FILE=/tmp/scan-1/index git -C /repo read-tree HEAD'
const CHECKOUT_INDEX =
  'GIT_INDEX_FILE=/tmp/scan-1/index git -C /repo checkout-index --all --prefix=/tmp/scan-1/files/'

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
    expect(local.calls).toContain('gitleaks detect --no-git --source /tmp/scan-1/files --redact')
    expect(local.calls).toContain(
      'semgrep scan --config p/typescript --config p/react --error --metrics=off --exclude e2e',
    )

    const docker = await report({ tools: ['docker'] })
    expect(docker.calls).toContain(
      'docker run --rm -v /tmp/scan-1/files:/repo ghcr.io/gitleaks/gitleaks:v8.18.4 detect --no-git --source /repo --redact',
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

  it('AC-150-5: WHEN the secret scan runs THEN it scans a copy of what git tracks at HEAD, never the checkout’s git-ignored files', async () => {
    for (const tools of [['gitleaks'], ['docker']]) {
      const { code, calls, removed } = await report({ tools })
      expect(code).toBe(0)
      const read = calls.indexOf(READ_TREE)
      const copy = calls.indexOf(CHECKOUT_INDEX)
      const scan = calls.findIndex((c) => c.includes('detect --no-git'))
      expect(read).toBeGreaterThan(-1)
      expect(read).toBeLessThan(copy)
      expect(copy).toBeLessThan(scan)
      expect(calls.join('\n')).not.toContain('-v /repo:/repo')
      expect(calls.filter((c) => c.startsWith('gitleaks detect'))).not.toContain(
        'gitleaks detect --no-git --source /repo --redact',
      )
      expect(removed).toEqual(['/tmp/scan-1'])
    }
  })

  it('AC-150-5: WHEN git can’t copy the tracked files THEN the secret scan fails and scans nothing', async () => {
    for (const failing of [[READ_TREE], [CHECKOUT_INDEX]]) {
      const { code, calls, removed, out } = await report({ tools: ['gitleaks'], failing })
      expect(code).toBe(1)
      expect(out).toContain('fail  secret scan (gitleaks)')
      expect(calls.filter((c) => c.startsWith('gitleaks detect'))).toEqual([])
      expect(removed).toEqual(['/tmp/scan-1'])
    }
  })

  it('AC-150-5: WHEN a tracked file is one the archive can skip THEN it is still in the copy the secret scan reads', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'scan-repo-'))
    const scratch = mkdtempSync(join(tmpdir(), 'scan-copy-'))
    try {
      const git = (...args: string[]) =>
        spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args])
      git('init', '-q')
      mkdirSync(join(repo, 'src'))
      writeFileSync(join(repo, '.gitattributes'), 'src/kept.txt export-ignore\n')
      writeFileSync(join(repo, 'src/kept.txt'), 'tracked\n')
      writeFileSync(join(repo, 'README.md'), 'tracked\n')
      git('add', '.')
      git('commit', '-q', '-m', 'files')
      writeFileSync(join(repo, '.env.local'), 'only in the checkout\n')
      let scanned: string[] = []
      const deps: CheckDeps = {
        run(cmd, args, cwd, env) {
          if (cmd === 'gitleaks' && args[0] === '--version')
            return Promise.resolve({ status: 0, stdout: '', stderr: '' })
          if (cmd === 'gitleaks') {
            const source = args[args.indexOf('--source') + 1]!
            scanned = readdirSync(source, { recursive: true }).map(String).sort()
            return Promise.resolve({ status: 0, stdout: '', stderr: '' })
          }
          const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' })
          return Promise.resolve({ status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr })
        },
        exists: () => false,
        read: () => undefined,
        tempDir: () => scratch,
        remove: () => undefined,
      }
      const scan = mergeChecks(deps, repo, repo).find((c) => c.name === 'secret scan (gitleaks)')!
      expect(await scan.run()).toEqual({ result: 'pass' })
      expect(scanned).toEqual(['.gitattributes', 'README.md', 'src', join('src', 'kept.txt')])
      expect(git('status', '--porcelain').stdout.toString()).toBe('?? .env.local\n')
    } finally {
      rmSync(repo, { recursive: true, force: true })
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('AC-150-8: WHEN the pnpm on PATH isn’t the version package.json pins THEN check:merge fails and says how to fix it', async () => {
    const { code, out } = await report({ pnpm: '10.28.0' })
    expect(code).toBe(1)
    expect(out).toContain('fail  the pnpm package.json pins')
    expect(out).toContain('pnpm 10.28.0 is first on PATH, and package.json pins pnpm@12.21.0')
  })

  it('AC-150-8: WHEN the pnpm on PATH is the pinned one THEN that check passes', async () => {
    const { out } = await report()
    expect(out).toContain('pass  the pnpm package.json pins')
  })
})

// `pnpm check:merge`: what a pull request needs before merge on top of `pnpm check` and
// `pnpm test:e2e`, run from the session (the pack ships no GitHub Actions workflows). It runs after
// `pnpm check`, which leaves the build the budgets read. A check that can't run here (no Docker, no
// docs/research) is skipped with the reason, never passed: the gate's comment lists the skips.
import type { CommandResult } from '../cloudflare/deps.ts'
import { pnpmProblem } from '../pnpm-pin.ts'

export interface CheckDeps {
  run(cmd: string, args: string[], cwd?: string): Promise<CommandResult>
  exists(path: string): boolean
  /** A file's text, or undefined when it can't be read. */
  read(path: string): string | undefined
  /** A new empty folder for a scratch copy. */
  tempDir(): string
  /** Removes a file or folder and everything in it. */
  remove(path: string): void
}

type Outcome = { result: 'pass' | 'fail' | 'skip'; note?: string }
export interface Check {
  name: string
  run(): Promise<Outcome>
}

const GITLEAKS = 'ghcr.io/gitleaks/gitleaks:v8.18.4'
const SEMGREP = 'semgrep/semgrep:1.185.0'
const SEMGREP_ARGS = [
  'scan',
  '--config',
  'p/typescript',
  '--config',
  'p/react',
  '--error',
  '--metrics=off',
  '--exclude',
  'e2e',
]

const lastLines = (r: CommandResult) => `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-15).join('\n')
const outcome = (r: CommandResult): Outcome =>
  r.status === 0 ? { result: 'pass' } : { result: 'fail', note: lastLines(r) }
const command = (deps: CheckDeps, name: string, cmd: string, args: string[]): Check => ({
  name,
  run: async () => outcome(await deps.run(cmd, args)),
})

/** A tool on PATH, else Docker with a running daemon, else nothing. */
async function tool(deps: CheckDeps, name: string): Promise<'local' | 'docker' | undefined> {
  if ((await deps.run(name, ['--version'])).status === 0) return 'local'
  if ((await deps.run('docker', ['info'])).status === 0) return 'docker'
  return undefined
}

const migrationsMatch = (deps: CheckDeps): Check => ({
  name: 'migrations match the tables',
  async run() {
    const generated = outcome(await deps.run('pnpm', ['db:generate']))
    if (generated.result === 'fail') return generated
    const changed = (await deps.run('git', ['status', '--porcelain', 'migrations'])).stdout.trim()
    if (!changed) return { result: 'pass' }
    return {
      result: 'fail',
      note: `A table changed without a migration. Run pnpm db:generate and commit:\n${changed}`,
    }
  },
})

const noClerkFiles = (deps: CheckDeps, root: string): Check => ({
  name: 'no Clerk claim files or keys committed',
  async run() {
    const listed = (
      await deps.run('git', ['-C', root, 'ls-files', '--', '.clerk', '**/.clerk/**'])
    ).stdout.trim()
    if (!listed) return { result: 'pass' }
    return {
      result: 'fail',
      note: `Committed under .clerk/: git rm -r --cached them, and rotate the keys.\n${listed}`,
    }
  },
})

const research = (deps: CheckDeps, root: string): Check => ({
  name: 'docs/research',
  async run() {
    const checker = `${root}/.agents/skills/research/scripts/check-research.mjs`
    if (!deps.exists(`${root}/docs/research`)) return { result: 'skip', note: 'no docs/research yet' }
    if (!deps.exists(checker)) return { result: 'skip', note: "the kit's research checker isn't installed" }
    return outcome(await deps.run('node', [checker, 'docs/research', '--base', 'origin/main'], root))
  },
})

const pinnedPnpm = (deps: CheckDeps, app: string, root: string): Check => ({
  name: 'the pnpm package.json pins',
  async run() {
    const version = await deps.run('pnpm', ['--version'])
    const onPath = version.status === 0 ? version.stdout : ''
    const problem =
      pnpmProblem(deps.read(`${app}/package.json`), onPath) ??
      pnpmProblem(deps.read(`${root}/package.json`), onPath)
    return problem ? { result: 'fail', note: problem } : { result: 'pass' }
  },
})

/** gitleaks over `files`, with the tool on PATH or in Docker. */
async function gitleaks(deps: CheckDeps, how: 'local' | 'docker', files: string): Promise<Outcome> {
  const args = ['detect', '--no-git', '--source', how === 'docker' ? '/repo' : files, '--redact']
  if (how === 'local') return outcome(await deps.run('gitleaks', args))
  return outcome(await deps.run('docker', ['run', '--rm', '-v', `${files}:/repo`, GITLEAKS, ...args]))
}

/**
 * Scans a copy of what git tracks at HEAD, not the checkout: in a dev checkout the git-ignored
 * .env.local, .dev.vars and .env.cloudflare.local hold the person's own keys, and would fail it.
 */
const secretScan = (deps: CheckDeps, root: string): Check => ({
  name: 'secret scan (gitleaks)',
  async run() {
    const how = await tool(deps, 'gitleaks')
    if (!how) return { result: 'skip', note: 'needs gitleaks or Docker' }
    const tree = deps.tempDir()
    try {
      const tar = `${tree}/tracked.tar`
      const copied = outcome(
        await deps.run('git', ['-C', root, 'archive', '--format=tar', '--prefix=files/', '-o', tar, 'HEAD']),
      )
      if (copied.result === 'fail') return copied
      const extracted = outcome(await deps.run('tar', ['-xf', tar, '-C', tree]))
      if (extracted.result === 'fail') return extracted
      return await gitleaks(deps, how, `${tree}/files`)
    } finally {
      deps.remove(tree)
    }
  },
})

const semgrep = (deps: CheckDeps, app: string): Check => ({
  name: 'Semgrep community rules',
  async run() {
    const how = await tool(deps, 'semgrep')
    if (how === 'local') return outcome(await deps.run('semgrep', SEMGREP_ARGS))
    if (how === 'docker')
      return outcome(
        await deps.run('docker', [
          'run',
          '--rm',
          '-v',
          `${app}:/src`,
          '-w',
          '/src',
          SEMGREP,
          'semgrep',
          ...SEMGREP_ARGS,
        ]),
      )
    return { result: 'skip', note: 'needs semgrep or Docker' }
  },
})

const screenshots = (deps: CheckDeps): Check => ({
  name: 'screenshots, in Playwright’s Linux image',
  async run() {
    if ((await deps.run('docker', ['info'])).status !== 0)
      return {
        result: 'skip',
        note: 'needs Docker: the baselines are made in Playwright’s Linux image, and fonts differ elsewhere',
      }
    return outcome(await deps.run('pnpm', ['test:visual', '--docker']))
  },
})

/** The checks, in order. `app` is this app's folder; `root` the git root (the monorepo's for apps/web). */
export const mergeChecks = (deps: CheckDeps, app: string, root: string): Check[] => [
  pinnedPnpm(deps, app, root),
  command(deps, 'bundle budgets (after pnpm check)', 'pnpm', ['check:budgets']),
  migrationsMatch(deps),
  command(deps, 'no high or critical advisories', 'pnpm', ['audit', '--audit-level=high']),
  command(deps, 'licences on the allow-list', 'pnpm', ['check:licenses']),
  noClerkFiles(deps, root),
  research(deps, root),
  secretScan(deps, root),
  semgrep(deps, app),
  screenshots(deps),
]

/** Runs every check, even after a failure, and prints one line each. 1 when any failed. */
export async function runChecks(checks: Check[], log: (line: string) => void): Promise<number> {
  let failed = 0
  for (const check of checks) {
    const { result, note } = await check.run()
    if (result === 'fail') failed++
    log(`${result.padEnd(4)}  ${check.name}${note ? `\n      ${note.replaceAll('\n', '\n      ')}` : ''}`)
  }
  log(failed ? `\n${failed} failed.` : '\nNo check failed. Name every skipped one in the pull request.')
  return failed ? 1 : 0
}

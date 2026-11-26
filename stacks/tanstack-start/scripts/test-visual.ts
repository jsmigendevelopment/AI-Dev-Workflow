// `pnpm test:visual`: the screenshot tests (e2e/visual.spec.ts) on a desktop and a phone.
// `pnpm test:visual --update` rewrites the baselines that changed; read each PNG before committing.
// `--docker` runs them in Playwright's Linux image, where the baselines are made: fonts differ
// between systems, so a baseline from a Mac fails on Linux. `pnpm check:merge` uses `--docker`.
// The git root is mounted, so a monorepo's lockfile is there (scripts/visual/docker.ts, and its test).
// Not yet run by the kit's authors: expect to adjust the first run.
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join, posix } from 'node:path'

import { dockerArgs } from './visual/docker.ts'

const docker = process.argv.includes('--docker')
const args = process.argv
  .slice(2)
  .filter((a) => a !== '--docker')
  .map((a) => (a === '--update' ? '--update-snapshots=changed' : a))
const playwright = [
  'exec',
  'playwright',
  'test',
  '--project=visual-desktop',
  '--project=visual-phone',
  ...args,
]
if (!docker && args.includes('--update-snapshots=changed') && process.platform !== 'linux')
  console.warn('Updating baselines off Linux: they will not match. Use pnpm test:visual --update --docker.')

/** A git command's output, or '' outside a git repo. */
const git = (gitArgs: string[]) => {
  const r = spawnSync('git', gitArgs, { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

function inDocker() {
  const root = git(['rev-parse', '--show-toplevel']) || process.cwd()
  const app = git(['rev-parse', '--show-prefix']).replace(/\/$/, '')
  const packages = git(['-C', root, 'ls-files', '--', ':(glob)**/package.json'])
    .split('\n')
    .filter(Boolean)
    .map((file) => posix.dirname(file).replace(/^\.$/, ''))
  const gitFolder = statSync(join(root, '.git'), { throwIfNoEntry: false })?.isDirectory() ?? false
  // Windows has no uid; root needs nothing handed back.
  const uid = process.getuid?.()
  const owner = uid ? `${uid}:${process.getgid?.() ?? uid}` : undefined
  return spawnSync('docker', dockerArgs({ root, app, packages, gitFolder, command: playwright, owner }), {
    stdio: 'inherit',
  })
}

const result = docker
  ? inDocker()
  : spawnSync('pnpm', playwright, {
      stdio: 'inherit',
      env: { ...process.env, VISUAL: '1' },
      shell: process.platform === 'win32',
    })
process.exit(result.status ?? 1)

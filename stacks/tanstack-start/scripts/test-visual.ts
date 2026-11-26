// `pnpm test:visual`: the screenshot tests (e2e/visual.spec.ts) on a desktop and a phone.
// `pnpm test:visual --update` rewrites the baselines that changed; read each PNG before committing.
// `--docker` runs them in Playwright's Linux image, where the baselines are made: fonts differ
// between systems, so a baseline from a Mac fails on Linux. `pnpm check:merge` uses `--docker`.
// The project folder is mounted. node_modules and .git are fresh empty volumes, so the host's
// install and its git hooks are untouched (lefthook skips itself outside a git repo).
// Not yet run by the kit's authors: expect to adjust the first run.
import { spawnSync } from 'node:child_process'

const IMAGE = 'mcr.microsoft.com/playwright:v1.65.1-noble' // keep in step with @playwright/test
const PNPM = 'pnpm@12.21.0' // keep in step with packageManager in package.json

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

const quote = (a: string) => `'${a.replaceAll("'", `'\\''`)}'`
const inImage = `npm install -g ${PNPM} && pnpm install --frozen-lockfile && pnpm ${playwright.map(quote).join(' ')}`
const result = docker
  ? spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--ipc=host',
        '-e',
        'VISUAL=1',
        '-v',
        `${process.cwd()}:/work`,
        '-v',
        '/work/node_modules',
        '-v',
        '/work/.git',
        '-w',
        '/work',
        IMAGE,
        'sh',
        '-c',
        inImage,
      ],
      { stdio: 'inherit' },
    )
  : spawnSync('pnpm', playwright, {
      stdio: 'inherit',
      env: { ...process.env, VISUAL: '1' },
      shell: process.platform === 'win32',
    })
process.exit(result.status ?? 1)

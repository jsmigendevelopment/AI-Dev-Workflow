// `pnpm test:visual`: the screenshot tests (e2e/visual.spec.ts) on a desktop and a phone.
// `pnpm test:visual --update` rewrites the baselines that changed; read each PNG before committing.
// Baselines are made on Linux in Playwright's image (CI's `visual` job, or the visual-baselines
// workflow): fonts differ between systems, so a baseline from a Mac would fail in CI.
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2).map((a) => (a === '--update' ? '--update-snapshots=changed' : a))
if (args.includes('--update-snapshots=changed') && process.platform !== 'linux')
  console.warn('Updating baselines off Linux: CI will likely reject them. Use the visual-baselines workflow.')

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--project=visual-desktop', '--project=visual-phone', ...args],
  { stdio: 'inherit', env: { ...process.env, VISUAL: '1' }, shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)

// The `docker run` arguments for `pnpm test:visual --docker`. The git root is mounted, not just the
// app's folder: in the monorepo pack the app is apps/web, and the lockfile is at the root. The install
// runs at the root, then the tests run from the app's folder. Every workspace's node_modules and the
// .git folder are fresh empty volumes, so the host's install and git hooks are untouched.
import { posix } from 'node:path'

const IMAGE = 'mcr.microsoft.com/playwright:v1.65.1-noble' // keep in step with @playwright/test
const PNPM = 'pnpm@12.21.0' // keep in step with packageManager in package.json

export interface DockerRun {
  /** The git root on the host (the monorepo's root for apps/web); the app's folder outside git. */
  root: string
  /** The app's folder inside root, with forward slashes: '' when it is the root. */
  app: string
  /** Each folder inside root with a tracked package.json: its node_modules gets its own empty volume. */
  packages: string[]
  /** root/.git is a folder. In a git worktree it is a file, which a volume can't cover. */
  gitFolder: boolean
  /** What runs after `pnpm` in the app's folder. */
  command: string[]
}

const quote = (a: string) => `'${a.replaceAll("'", `'\\''`)}'`
const inside = (path: string) => posix.join('/work', path)

/** The arguments after `docker`. */
export function dockerArgs(run: DockerRun): string[] {
  const folders = [...new Set(['', run.app, ...run.packages])]
  const volumes = folders.flatMap((folder) => ['-v', inside(posix.join(folder, 'node_modules'))])
  const script = `npm install -g ${PNPM} && pnpm --dir /work install --frozen-lockfile && pnpm ${run.command.map(quote).join(' ')}`
  return [
    'run',
    '--rm',
    '--ipc=host',
    '-e',
    'VISUAL=1',
    '-v',
    `${run.root}:/work`,
    ...volumes,
    ...(run.gitFolder ? ['-v', '/work/.git'] : []),
    '-w',
    inside(run.app),
    IMAGE,
    'sh',
    '-c',
    script,
  ]
}

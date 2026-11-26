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
  const tests = `npm install -g ${PNPM} && pnpm --dir /work install --frozen-lockfile && pnpm ${run.command.map(quote).join(' ')}`
  // The container runs as root, so dist/, .wrangler/, test-results/ and new baselines would be
  // root's on a Linux host, and the next build there couldn't clean them. So what root wrote goes
  // to the mounted folder's owner, as the container sees it. Under rootless Docker or Podman the
  // host user is the container's root, so that owner is 0:0 and nothing is changed: a chown there
  // would hand the whole checkout to a uid the user can't write. The same for a root host user.
  // Keep the tests' status.
  const giveBack =
    `owner=$(stat -c %u:%g /work); if [ -n "$owner" ] && [ "$owner" != 0:0 ]; then ` +
    `find /work \\( -path '*/node_modules' -o -path /work/.git \\) -prune -o -user 0 -exec chown -h "$owner" {} +; fi`
  const script = `${tests}; status=$?; ${giveBack}; exit $status`
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

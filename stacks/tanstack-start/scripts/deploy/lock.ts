// One deploy of each kind at a time, as the old workflows' concurrency groups did: two test deploys
// at once would race their migrations and rollbacks. The lock is a file in git's common folder, so
// every worktree of this clone sees it. It holds the PID and the start time; a lock whose process
// has ended is taken over. Other clones and machines don't see it.
import type { DeployDeps } from './deps.ts'
import { Stop, tail } from './shared.ts'

/** Runs `work` holding the `kind` lock (`test`, `production`, `preview-12`). `what` names the run. */
export async function oneAtATime<T>(deps: DeployDeps, kind: string, what: string, work: () => Promise<T>) {
  const common = await deps.run('git', ['rev-parse', '--git-common-dir'])
  if (common.status !== 0)
    throw new Stop(`git couldn't find this checkout's folder for the deploy lock:\n${tail(common, 5)}`)
  const path = `${common.stdout.trim()}/onrails-deploy-${kind}.lock`
  const mine = `${deps.pid} ${new Date().toISOString()}`
  if (!deps.create(path, mine)) {
    const [pid, since] = deps.readText(path).trim().split(' ')
    if (deps.alive(Number(pid)))
      throw new Stop(
        `another ${what} is running (PID ${pid}, since ${since}). Wait for it to finish, then run this again. ` +
          `If none is running, delete ${path}. Nothing was changed.`,
      )
    deps.log(`- take over the lock left by an ended run (PID ${pid})`)
    deps.remove(path)
    if (!deps.create(path, mine))
      throw new Stop(`another ${what} took the lock (${path}) just now. Nothing was changed.`)
  }
  try {
    return await work()
  } finally {
    if (deps.exists(path) && deps.readText(path) === mine) deps.remove(path)
  }
}

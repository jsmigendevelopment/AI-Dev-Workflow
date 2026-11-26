// One deploy of each kind at a time, as the old workflows' concurrency groups did: two test deploys
// at once would race their migrations and rollbacks. The lock is a file in git's common folder, so
// every worktree of this clone sees it. It holds the PID and the start time; a lock whose process
// has ended is taken over. Other clones and machines don't see it.
// Two runs can find the same ended run's lock. Each takes over only under a second exclusive file
// (`<lock>.takeover`), after reading the lock again: the second one then finds the first one's lock
// and stops. The lock is read without following a link, and only "<digits> <ISO time>" is trusted.
import type { DeployDeps } from './deps.ts'
import { Stop, tail } from './shared.ts'

const LOCK = /^(\d+) (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)$/

/** The lock's raw text and its PID and start time; undefined when it isn't a lock this script wrote. */
function holder(deps: DeployDeps, path: string) {
  const text = deps.readPlain(path)
  const match = text === undefined ? null : LOCK.exec(text)
  return match && text ? { text, pid: Number(match[1]), since: match[2]! } : undefined
}

/** Replaces the ended run's lock (`stale`, its exact text) with `mine`, under the takeover file. */
function takeOver(
  deps: DeployDeps,
  path: string,
  stale: { text: string; pid: number },
  mine: string,
  what: string,
) {
  const guard = `${path}.takeover`
  const taken = `another ${what} took the lock (${path}) just now. Nothing was changed.`
  if (!deps.create(guard, mine))
    throw new Stop(`${taken} If none is running, delete ${guard}, then run this again.`)
  try {
    const now = deps.readPlain(path)
    if (now !== undefined && now !== stale.text) throw new Stop(taken)
    deps.log(`- take over the lock left by an ended run (PID ${stale.pid})`)
    deps.remove(path)
    if (!deps.create(path, mine)) throw new Stop(taken)
  } finally {
    deps.remove(guard)
  }
}

/** Takes the lock, or stops: another run holds it, or the file isn't one this script wrote. */
function take(deps: DeployDeps, path: string, mine: string, what: string) {
  if (deps.create(path, mine)) return
  const held = holder(deps, path)
  // Gone since the create (its run just ended): one more try.
  if (!held && deps.readPlain(path) === undefined && deps.create(path, mine)) return
  if (!held)
    throw new Stop(
      `the deploy lock ${path} isn't one this script wrote (a link, or not "<PID> <start time>"). ` +
        `If no other ${what} is running, delete it by hand, then run this again. Nothing was changed.`,
    )
  if (deps.alive(held.pid))
    throw new Stop(
      `another ${what} is running (PID ${held.pid}, since ${held.since}). Wait for it to finish, then run this again. ` +
        `If none is running, delete ${path}. Nothing was changed.`,
    )
  takeOver(deps, path, held, mine, what)
}

/** Runs `work` holding the `kind` lock (`test`, `production`, `preview-12`). `what` names the run. */
export async function oneAtATime<T>(deps: DeployDeps, kind: string, what: string, work: () => Promise<T>) {
  const common = await deps.run('git', ['rev-parse', '--git-common-dir'])
  if (common.status !== 0)
    throw new Stop(`git couldn't find this checkout's folder for the deploy lock:\n${tail(common, 5)}`)
  const path = `${common.stdout.trim()}/onrails-deploy-${kind}.lock`
  const mine = `${deps.pid} ${new Date().toISOString()}`
  take(deps, path, mine, what)
  try {
    return await work()
  } finally {
    if (deps.readPlain(path) === mine) deps.remove(path)
  }
}

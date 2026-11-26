// `wrangler deploy`, then the smoke test. wrangler 4.164 makes the new version live at 100% first,
// then sets routes, custom domains and crons, and a failure there still fails the step. So the newest
// deployment is read (read-only) before the deploy and again after a failed or crashed one: this
// run's version went live anyway only when the newest deployment changed and carries this run's
// message. Then it is smoke-tested and rolled back like any other. An earlier run of the same commit
// carries the same message, so the message alone can't tell. When nothing new went live, nothing is
// rolled back: that would replace the good live version with the one before it.
import type { CommandResult } from '../cloudflare/deps.ts'
import type { ChildEnv, DeployDeps } from './deps.ts'
import { afterDeploy, failure, noEarlierVersion, Stop, tail } from './shared.ts'

export interface Release {
  env: ChildEnv
  worker: string
  sha: string
  /** The deploy's `--message`: the newest deployment carries it once this version is live. */
  message: string
  /** The step's name in the log, such as "deploy the test Worker". */
  what: string
  /** What every stop message ends with: what a rollback doesn't undo, and what to do next. */
  after: string
}

interface Deployment {
  id?: string
  created_on?: string
  annotations?: Record<string, string>
}

/** The newest deployment, or that the Worker or its deployments aren't there, or why it can't be read. */
type Newest = { id: string; message: string } | 'no worker' | 'no deployment' | { unreadable: string }

const unreadable = (n: Newest): n is { unreadable: string } => typeof n === 'object' && 'unreadable' in n
const deployment = (n: Newest): n is { id: string; message: string } => typeof n === 'object' && 'id' in n

/** wrangler's "This Worker does not exist on your account". */
const NO_WORKER = /\[code: 10007\]/

async function newest(deps: DeployDeps, at: Release): Promise<Newest> {
  const listed = await deps
    .wrangler(['deployments', 'list', '--name', at.worker, '--json'], at.env)
    .catch((error: unknown): CommandResult => ({ status: 1, stdout: '', stderr: String(error) }))
  if (listed.status !== 0) return NO_WORKER.test(tail(listed)) ? 'no worker' : { unreadable: tail(listed, 5) }
  try {
    const all = JSON.parse(listed.stdout.slice(listed.stdout.indexOf('['))) as Deployment[]
    const last = all.sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? '')).at(-1)
    if (!last) return 'no deployment'
    return { id: last.id ?? '', message: last.annotations?.['workers/message'] ?? '' }
  } catch (error) {
    return { unreadable: `wrangler deployments list didn't print JSON (${String(error)})` }
  }
}

const unknown = (at: Release, why: string, first: boolean) =>
  `Couldn't tell whether this run's version went live: ${why}\nNothing was rolled back. ` +
  `Check: pnpm exec wrangler deployments list --name ${at.worker}. If its newest deployment is "${at.message}" ` +
  `and was made after this run started, it is live and untested: smoke-test it` +
  (first
    ? `. If it fails, ${noEarlierVersion(at.worker)}.`
    : `, or roll it back with pnpm exec wrangler rollback --name ${at.worker}.`)

/** Why this run's version doesn't count as live after a failed deploy; undefined when it does. */
function notLive(at: Release, before: Newest, after: Newest): string | undefined {
  const first = before === 'no worker' || before === 'no deployment'
  if (unreadable(after)) return unknown(at, after.unreadable, first)
  if (after === 'no worker')
    return `Nothing new went live: ${at.worker} doesn't exist on the account yet, so nothing of this run could be live. Nothing was rolled back.`
  if (after === 'no deployment')
    return `Nothing new went live: no deployment of ${at.worker} is listed. Nothing was rolled back.`
  if (after.message !== at.message)
    return first
      ? unknown(
          at,
          `${at.worker} had no deployment before this run, and its newest one now carries "${after.message}". A first deploy may not carry its message.`,
          true,
        )
      : `Nothing new went live: the newest deployment of ${at.worker} isn't "${at.message}". Nothing was rolled back.`
  if (unreadable(before))
    return unknown(
      at,
      `the deployments couldn't be read before the deploy, so this run can't be told apart from an earlier run of the same commit:\n${before.unreadable}`,
      false,
    )
  if (deployment(before) && before.id === after.id)
    return `Nothing new went live: the newest deployment of ${at.worker} is the one from before this run, an earlier run of the same commit ("${at.message}"). It stays, and nothing was rolled back.`
  return undefined
}

/**
 * Deploys, then runs `verify` (find the URL, smoke-test it) with the deploy's output. Any failure
 * after this run's version went live, even part-way through a failed deploy, rolls it back, unless
 * there is no earlier version to roll back to.
 */
export async function deployAndVerify(deps: DeployDeps, at: Release, verify: (out: string) => Promise<void>) {
  const before = await newest(deps, at)
  const live = { ...at, first: before === 'no worker' || before === 'no deployment' }
  deps.log(`- ${at.what}`)
  const ran = await deps.wrangler(['deploy', '--message', at.message], at.env).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  if ('result' in ran && ran.result.status === 0)
    return afterDeploy(deps, live, () => verify(ran.result.stdout))
  const why =
    'result' in ran ? `"${at.what}" failed:\n${tail(ran.result)}` : failure(ran.error, 'during the deploy')
  const stopped = notLive(at, before, await newest(deps, at))
  if (stopped) throw new Stop(`${why}\n\n${stopped}\n${at.after}`)
  const anyway = `This run's version went live anyway (the newest deployment of ${at.worker} is "${at.message}").`
  deps.log(`- the deploy failed part-way, and this run's version is live: smoke-test it`)
  const out = 'result' in ran ? `${ran.result.stdout}\n${ran.result.stderr}` : ''
  try {
    await afterDeploy(deps, live, () => verify(out))
  } catch (error) {
    throw new Stop(`${why}\n\n${anyway} It was smoke-tested:\n${failure(error, 'after the deploy')}`)
  }
  throw new Stop(
    `${why}\n\n${anyway} It passed its smoke test, so it stays. The rest of the deploy (routes, custom domains and crons) ` +
      `may not be set: fix the error above, then deploy again.\n${at.after}`,
  )
}

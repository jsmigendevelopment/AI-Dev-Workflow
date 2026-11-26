// `wrangler deploy`, then the smoke test. wrangler 4.164 makes the new version live at 100% first,
// then sets routes, custom domains and crons, and a failure there still fails the step. So after a
// failed or crashed deploy, the newest deployment (read-only) says whether this run's version went
// live anyway: if it did, it is smoke-tested and rolled back like any other. When nothing went live,
// nothing is rolled back: that would replace the good live version with the one before it.
import type { CommandResult } from '../cloudflare/deps.ts'
import type { ChildEnv, DeployDeps } from './deps.ts'
import { afterDeploy, failure, Stop, tail } from './shared.ts'

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
  created_on?: string
  annotations?: Record<string, string>
}

/** The newest deployment's message ('' when none is listed), or why the list couldn't be read. */
async function newestMessage(deps: DeployDeps, at: Release): Promise<string | { unreadable: string }> {
  const listed = await deps
    .wrangler(['deployments', 'list', '--name', at.worker, '--json'], at.env)
    .catch((error: unknown): CommandResult => ({ status: 1, stdout: '', stderr: String(error) }))
  if (listed.status !== 0) return { unreadable: tail(listed, 5) }
  try {
    const all = JSON.parse(listed.stdout.slice(listed.stdout.indexOf('['))) as Deployment[]
    const newest = all.sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? '')).at(-1)
    return newest?.annotations?.['workers/message'] ?? ''
  } catch (error) {
    return { unreadable: `wrangler deployments list didn't print JSON (${String(error)})` }
  }
}

const unknown = (at: Release, why: string) =>
  `Couldn't tell whether this run's version went live: ${why}\nNothing was rolled back. ` +
  `Check: pnpm exec wrangler deployments list --name ${at.worker}. If the newest deployment's message is ` +
  `"${at.message}", it is live and untested: smoke-test it, or roll it back with pnpm exec wrangler rollback --name ${at.worker}.`

/**
 * Deploys, then runs `verify` (find the URL, smoke-test it) with the deploy's output. Any failure
 * after this run's version went live, even part-way through a failed deploy, rolls it back.
 */
export async function deployAndVerify(deps: DeployDeps, at: Release, verify: (out: string) => Promise<void>) {
  deps.log(`- ${at.what}`)
  const ran = await deps.wrangler(['deploy', '--message', at.message], at.env).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  if ('result' in ran && ran.result.status === 0)
    return afterDeploy(deps, at, () => verify(ran.result.stdout))
  const why =
    'result' in ran ? `"${at.what}" failed:\n${tail(ran.result)}` : failure(ran.error, 'during the deploy')
  const newest = await newestMessage(deps, at)
  if (typeof newest !== 'string') throw new Stop(`${why}\n\n${unknown(at, newest.unreadable)}\n${at.after}`)
  if (newest !== at.message)
    throw new Stop(
      `${why}\n\nNothing new went live: the newest deployment of ${at.worker} isn't "${at.message}". Nothing was rolled back.\n${at.after}`,
    )
  const live = `This run's version went live anyway (the newest deployment of ${at.worker} is "${at.message}").`
  deps.log(`- the deploy failed part-way, and this run's version is live: smoke-test it`)
  const out = 'result' in ran ? `${ran.result.stdout}\n${ran.result.stderr}` : ''
  try {
    await afterDeploy(deps, at, () => verify(out))
  } catch (error) {
    throw new Stop(`${why}\n\n${live} It was smoke-tested:\n${failure(error, 'after the deploy')}`)
  }
  throw new Stop(
    `${why}\n\n${live} It passed its smoke test, so it stays. The rest of the deploy (routes, custom domains and crons) ` +
      `may not be set: fix the error above, then deploy again.\n${at.after}`,
  )
}

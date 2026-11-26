// What the three session deploys share: running a step, the checkout checks, the protection
// headers for the smoke test, the smoke test itself, the rollback after a failed one, and masking.
import type { CommandResult } from '../cloudflare/deps.ts'
import { LOCAL_FILE } from '../cloudflare/local-env.ts'
import { type EnvName, type EnvResources, readResources } from '../cloudflare/wrangler-config.ts'
import type { ChildEnv, DeployDeps } from './deps.ts'

/** A deploy stopped on purpose. The message says what happened and what to do next. */
export class Stop extends Error {}

/**
 * `CLOUDFLARE_ENV` picks the environment block in wrangler.jsonc, for the build and for wrangler.
 * A `SITE_URL` in the shell is dropped: only the production build sets it, on purpose.
 */
export const targetEnv = (target: EnvName): ChildEnv => ({ CLOUDFLARE_ENV: target, SITE_URL: undefined })

/** A name whose value is a secret: a token, secret, password, key or client ID. */
const SECRET_NAME =
  /(^|[_-])(token|authtoken|secret|password|passwd|pass|pat|key|apikey|auth|client_id|credentials?|cookie)([_-]|$)/i

/**
 * Runs a deploy with its output masked: every secret value in the shell or .env.cloudflare.local
 * (by name, which covers the protection's client ID, secret and password) is replaced by *** in each
 * log line and in the stop message. Commands still get the real values, and parsing reads raw output.
 */
export async function masking(deps: DeployDeps, work: (deps: DeployDeps) => Promise<void>) {
  const values = deps
    .known()
    .filter(([name, value]) => value && SECRET_NAME.test(name))
    .flatMap(([, value]) => [value!, encodeURIComponent(value!)])
  const hidden = [...new Set(values)].sort((a, b) => b.length - a.length)
  const mask = (text: string) => hidden.reduce((out, value) => out.replaceAll(value, '***'), text)
  try {
    await work({ ...deps, log: (line) => deps.log(mask(line)) })
  } catch (error) {
    if (error instanceof Stop) throw new Stop(mask(error.message))
    if (error instanceof Error) {
      error.message = mask(error.message)
      error.stack = error.stack && mask(error.stack)
    }
    throw error
  }
}

/** The last lines of a command's output, for a failure message. */
export const tail = (r: CommandResult, lines = 30) =>
  `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-lines).join('\n')

/** Runs one step and returns its output. A failed step stops the deploy with its name and output. */
export async function step(deps: DeployDeps, what: string, result: Promise<CommandResult>) {
  deps.log(`- ${what}`)
  const r = await result
  if (r.status !== 0) throw new Stop(`"${what}" failed:\n${tail(r)}`)
  return r.stdout
}

/** The environment's block in wrangler.jsonc: its Worker, databases and vars. */
export const environment = (deps: DeployDeps, target: EnvName): EnvResources =>
  readResources(deps.readText('wrangler.jsonc'))[target]

export async function headSha(deps: DeployDeps) {
  return (await step(deps, 'read the commit', deps.run('git', ['rev-parse', 'HEAD']))).trim()
}

const ORIGIN_MAIN = 'refs/remotes/origin/main'

/**
 * Test and production deploys go out from a clean checkout of main that is exactly GitHub's main:
 * not behind it, and with no commit GitHub doesn't have. So what ships is what merged.
 */
export async function onCleanMain(deps: DeployDeps) {
  const branch = (await deps.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  if (branch !== 'main')
    throw new Stop(
      `deploys go out from main, and this checkout is on "${branch}". Run: git switch main && git pull`,
    )
  if ((await deps.run('git', ['status', '--porcelain'])).stdout.trim())
    throw new Stop('the checkout has uncommitted changes. Deploy from a clean checkout of main.')
  const fetched = await deps.run('git', ['fetch', '--quiet', 'origin', `+refs/heads/main:${ORIGIN_MAIN}`])
  if (fetched.status !== 0)
    throw new Stop(
      `could not fetch main from GitHub, so this checkout can't be compared with it:\n${tail(fetched, 5)}\nNothing was deployed.`,
    )
  const here = (await deps.run('git', ['rev-parse', 'HEAD'])).stdout.trim()
  const github = (await deps.run('git', ['rev-parse', ORIGIN_MAIN])).stdout.trim()
  if (here && here === github) return
  const behind = (await deps.run('git', ['merge-base', '--is-ancestor', 'HEAD', ORIGIN_MAIN])).status === 0
  throw new Stop(
    behind
      ? `this checkout of main (${here.slice(0, 7)}) is behind GitHub's main (${github.slice(0, 7)}). Run: git pull --ff-only, then deploy again. Nothing was deployed.`
      : `this checkout of main (${here.slice(0, 7)}) has commits that aren't on GitHub's main (${github.slice(0, 7)}), so they were never reviewed. ` +
          'Only what merged on GitHub deploys: get them there through a pull request, then deploy from an up-to-date main. Nothing was deployed.',
  )
}

export const workersDevUrl = (out: string) => /https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(out)?.[0]

const GATE = ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET', 'SITE_PASSWORD'] as const

/**
 * The protection headers' values for the smoke test, by the names `e2e/gate.ts` reads. Test and
 * previews read `TEST_<name>`, then `<name>`; production reads only `PRODUCTION_<name>`, so a
 * test token is never sent to production. Stops before anything deploys when a protected site's
 * values are missing: the smoke test would fail and roll back a good deploy.
 */
export function gateEnv(deps: DeployDeps, target: EnvName, vars: Record<string, string>): ChildEnv {
  const prefix = target === 'test' ? 'TEST_' : 'PRODUCTION_'
  const value = (name: string) =>
    deps.local(`${prefix}${name}`) ?? (target === 'test' ? deps.local(name) : undefined)
  const env: ChildEnv = Object.fromEntries(GATE.map((name) => [name, value(name)]))
  const protection = vars.SITE_PROTECTION ?? 'none'
  const everyPath = !vars.ACCESS_PATHS || vars.ACCESS_PATHS === '/*'
  const needs =
    protection === 'access' && everyPath && !(env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET)
      ? ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']
      : protection === 'password' && !env.SITE_PASSWORD
        ? ['SITE_PASSWORD']
        : []
  if (needs.length)
    throw new Stop(
      `the ${target} site is protected (${protection}), so the smoke test needs ${needs.map((n) => prefix + n).join(' and ')} ` +
        `in the shell or ${LOCAL_FILE} (git-ignored). Nothing was deployed.`,
    )
  return env
}

/** The smoke test's browser, before anything is written: a failed install then changes nothing. */
export const installChromium = (deps: DeployDeps) =>
  step(deps, 'install Chromium', deps.run('pnpm', ['exec', 'playwright', 'install', 'chromium']))

/** Runs a smoke suite against a deployed URL. The caller decides what a failure means. */
export function smoke(deps: DeployDeps, script: string, url: string, gate: ChildEnv) {
  deps.log(`- smoke test (pnpm ${script}) against ${url}`)
  return deps.run('pnpm', [script], { BASE_URL: url, ...gate })
}

/** What happened after a failed check. Its text says plainly when the new version is still live. */
async function rollBack(deps: DeployDeps, env: ChildEnv, worker: string, sha: string) {
  deps.log('- roll back to the previous version')
  const back = await deps
    .wrangler(['rollback', '--yes', '--message', `smoke failed on ${sha}`], env)
    .catch((error: unknown): CommandResult => ({ status: 1, stdout: '', stderr: String(error) }))
  if (back.status === 0) return 'Rolled back: the previous version is serving again.'
  return (
    `The rollback failed too:\n${tail(back, 5)}\n` +
    `The new version (${sha}) is live on ${worker} and untested. Roll it back by hand now: pnpm exec wrangler rollback --name ${worker}`
  )
}

/**
 * Runs what follows a successful `wrangler deploy` (finding the URL, the smoke test). Any failure in
 * it, a stop or a crash, rolls the code back, so a version that never passed its smoke test doesn't
 * stay live. `after` ends the stop message: what the rollback didn't undo, and what to do next.
 */
export async function afterDeploy(
  deps: DeployDeps,
  at: { env: ChildEnv; worker: string; sha: string; after: string },
  verify: () => Promise<void>,
) {
  try {
    await verify()
  } catch (error) {
    const why =
      error instanceof Stop
        ? error.message
        : `the deploy script crashed after the deploy: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
    throw new Stop(`${why}\n\n${await rollBack(deps, at.env, at.worker, at.sha)}\n${at.after}`)
  }
}

/** A build leaves a redirect to its flattened config; later `--env` commands must not follow it. */
export function clearRedirect(deps: DeployDeps) {
  if (deps.exists('.wrangler/deploy/config.json')) deps.remove('.wrangler/deploy/config.json')
}

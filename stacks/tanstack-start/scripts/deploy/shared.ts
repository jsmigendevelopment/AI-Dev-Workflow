// What the three session deploys share: running a step, the checkout checks, the protection
// headers for the smoke test, and the smoke test itself.
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

/** Test and production deploys go out from a clean checkout of main, so what ships is what merged. */
export async function onCleanMain(deps: DeployDeps) {
  const branch = (await deps.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  if (branch !== 'main')
    throw new Stop(
      `deploys go out from main, and this checkout is on "${branch}". Run: git switch main && git pull`,
    )
  if ((await deps.run('git', ['status', '--porcelain'])).stdout.trim())
    throw new Stop('the checkout has uncommitted changes. Deploy from a clean checkout of main.')
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

/** Runs a smoke suite against a deployed URL. The caller decides what a failure means. */
export async function smoke(deps: DeployDeps, script: string, url: string, gate: ChildEnv) {
  await step(deps, 'install Chromium', deps.run('pnpm', ['exec', 'playwright', 'install', 'chromium']))
  deps.log(`- smoke test (pnpm ${script}) against ${url}`)
  return deps.run('pnpm', [script], { BASE_URL: url, ...gate })
}

/** A build leaves a redirect to its flattened config; later `--env` commands must not follow it. */
export function clearRedirect(deps: DeployDeps) {
  if (deps.exists('.wrangler/deploy/config.json')) deps.remove('.wrangler/deploy/config.json')
}

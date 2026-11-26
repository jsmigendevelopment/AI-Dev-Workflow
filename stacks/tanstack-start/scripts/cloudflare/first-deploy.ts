// The first test deploy. Pull request previews are versions of the test Worker, so it must exist
// before the first pull request; `pnpm deploy:test` makes it only after a merge. Same commands as
// `pnpm deploy:test`, with one change: this first version is the Coming soon page (LAUNCHED=false).
// The app itself goes live on the test URL with the first merge, through `pnpm deploy:test` and its
// smoke test, with the protection recorded in wrangler.jsonc. So the app is never live unprotected,
// and with Access the Worker that Access attaches to (later in the same run) only ever showed Coming soon.
import type { CommandResult, Deps, Log, Options } from './deps.ts'
import type { EnvResources } from './wrangler-config.ts'

/** What happened, so the Access step knows whether the test Worker is coming. */
type FirstDeploy = 'exists' | 'deployed' | 'planned' | 'skipped'

const TEST = { CLOUDFLARE_ENV: 'test' } // env.test in wrangler.jsonc: never production
/** wrangler's "This Worker does not exist on your account" API error code. */
const NO_SUCH_WORKER = '[code: 10007]'

const lastLine = (r: { stdout: string; stderr: string }) =>
  (r.stderr || r.stdout).trim().split('\n').at(-1) ?? ''

/** True when the Worker exists; throws when wrangler can't tell. The session deploys use it too. */
export async function workerExists(
  deps: { wrangler(args: string[]): Promise<CommandResult> },
  worker: string,
): Promise<boolean> {
  const listed = await deps.wrangler(['versions', 'list', '--name', worker, '--json'])
  if (listed.status === 0) return true
  if (`${listed.stdout}\n${listed.stderr}`.includes(NO_SUCH_WORKER)) return false
  throw new Error(`could not check whether the Worker ${worker} exists: ${lastLine(listed)}`)
}

async function step(deps: Deps, what: string, cmd: string, args: string[]) {
  const result =
    cmd === 'wrangler'
      ? await deps.wrangler(args, undefined, TEST)
      : await deps.run(cmd, args, undefined, TEST)
  if (result.status !== 0)
    throw new Error(
      `the first test deploy failed at "${what}": ${lastLine(result)}. Fix it and run this again; it picks up where it stopped.`,
    )
  return result.stdout
}

/** Step 4: build, migrate the test database and deploy the test Worker, once. */
export async function firstTestDeploy(
  deps: Deps,
  options: Options,
  log: Log,
  test: EnvResources,
): Promise<FirstDeploy> {
  if (options.noFirstDeploy) {
    log('Skipped (--no-first-deploy). Pull request previews fail until the test Worker exists:')
    log('run this again without the flag before the first pull request.')
    return 'skipped'
  }
  if (await workerExists(deps, test.worker)) {
    log(`exists  test Worker ${test.worker} (pnpm deploy:test deploys main after each merge)`)
    return 'exists'
  }
  if (options.dryRun) {
    log(
      `would build with CLOUDFLARE_ENV=test, apply the D1 migrations to ${test.databases.map((d) => d.name).join(', ') || 'the test database'}`,
    )
    log(
      `would deploy the test Worker ${test.worker} as the Coming soon page (the app goes live there with the first merge)`,
    )
    return 'planned'
  }
  log(`deploying the test Worker ${test.worker} for the first time (the Coming soon page)`)
  await step(deps, 'pnpm build', 'pnpm', ['build'])
  // `-c wrangler.jsonc`: D1 commands read the source config, not the build's flattened copy.
  await step(deps, 'D1 migrations', 'wrangler', [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--remote',
    '-c',
    'wrangler.jsonc',
  ])
  const out = await step(deps, 'wrangler deploy', 'wrangler', [
    'deploy',
    '--message',
    'first test deploy (setup-cloudflare)',
    '--var',
    'LAUNCHED:false',
  ])
  // A build leaves a redirect to its flattened config; later `--env` commands must not follow it.
  if (deps.exists('.wrangler/deploy/config.json')) deps.remove('.wrangler/deploy/config.json')
  const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(out)?.[0]
  log(`  deployed${url ? `: ${url}` : ''}. Pull request previews can upload to it now.`)
  return 'deployed'
}

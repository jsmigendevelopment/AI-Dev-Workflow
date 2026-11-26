// `pnpm deploy:test`: main to the test site, run from the session after each merge. Build, migrate
// the test database, deploy, then the smoke test against the deployed URL. A failed smoke test
// puts the previous version back and stops with what to put in a bug issue. The very first test
// deploy is setup-cloudflare's (the same commands), so the first pull request has a Worker to
// preview on.
import type { DeployDeps } from './deps.ts'
import {
  clearRedirect,
  environment,
  gateEnv,
  headSha,
  onCleanMain,
  smoke,
  step,
  Stop,
  tail,
  targetEnv,
  workersDevUrl,
} from './shared.ts'

const TEST = targetEnv('test')

export async function deployTest(deps: DeployDeps) {
  await onCleanMain(deps)
  const test = environment(deps, 'test')
  const gate = gateEnv(deps, 'test', test.vars)
  const sha = (await headSha(deps)).slice(0, 7)
  try {
    // No SITE_URL: the test site is sent noindex everywhere.
    await step(deps, 'build for test', deps.run('pnpm', ['build'], TEST))
    // `-c wrangler.jsonc`: D1 commands read the source config, not the build's flattened copy.
    const migrate = ['d1', 'migrations', 'apply', 'DB', '--remote', '-c', 'wrangler.jsonc']
    await step(deps, 'apply the D1 migrations to test', deps.wrangler(migrate, TEST))
    const out = await step(
      deps,
      'deploy the test Worker',
      deps.wrangler(['deploy', '--message', `main ${sha}`], TEST),
    )
    const url = deps.local('TEST_APP_URL') ?? workersDevUrl(out)
    if (!url) throw new Stop('no URL in the deploy output. Set TEST_APP_URL to the test site.')
    const smoked = await smoke(deps, 'test:deployed', url, gate)
    if (smoked.status === 0) return deps.log(`Test site: ${url} (main ${sha}). Smoke test passed.`)
    const back = await deps.wrangler(['rollback', '--yes', '--message', `smoke failed on ${sha}`], TEST)
    throw new Stop(
      `the smoke test failed on ${url} after deploying main ${sha}:\n${tail(smoked)}\n\n` +
        (back.status === 0
          ? 'Rolled back: the previous version is serving again.'
          : `The rollback failed too:\n${tail(back, 5)}`) +
        '\nMigrations stay applied: a rollback puts back code, never data. Open a bug issue labelled needs-human with this output.',
    )
  } finally {
    clearRedirect(deps)
  }
}

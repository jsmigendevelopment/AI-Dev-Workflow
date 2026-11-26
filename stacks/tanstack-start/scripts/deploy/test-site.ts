// `pnpm deploy:test`: main to the test site, run from the session after each merge. Build, migrate
// the test database, deploy, then the smoke test against the deployed URL. Any failure after the
// deploy (no URL, a failed smoke test, a crash) puts the previous version back and stops with what
// to put in a bug issue. The deploy output is masked. The very first test deploy is
// setup-cloudflare's (the same commands), so the first pull request has a Worker to preview on.
import type { DeployDeps } from './deps.ts'
import {
  afterDeploy,
  clearRedirect,
  environment,
  gateEnv,
  headSha,
  installChromium,
  masking,
  onCleanMain,
  smoke,
  step,
  Stop,
  tail,
  targetEnv,
  workersDevUrl,
} from './shared.ts'

const TEST = targetEnv('test')
const AFTER =
  'Migrations stay applied: a rollback puts back code, never data. Open a bug issue labelled needs-human with this output.'

async function deploy(deps: DeployDeps) {
  await onCleanMain(deps)
  const test = environment(deps, 'test')
  const gate = gateEnv(deps, 'test', test.vars)
  const sha = (await headSha(deps)).slice(0, 7)
  await installChromium(deps)
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
    await afterDeploy(deps, { env: TEST, worker: test.worker, sha, after: AFTER }, async () => {
      const url = deps.local('TEST_APP_URL') ?? workersDevUrl(out)
      if (!url)
        throw new Stop(
          'no URL in the deploy output, so nothing was smoke-tested. Set TEST_APP_URL to the test site.',
        )
      const smoked = await smoke(deps, 'test:deployed', url, gate)
      if (smoked.status !== 0)
        throw new Stop(`the smoke test failed on ${url} after deploying main ${sha}:\n${tail(smoked)}`)
      deps.log(`Test site: ${url} (main ${sha}). Smoke test passed.`)
    })
  } finally {
    clearRedirect(deps)
  }
}

export const deployTest = (deps: DeployDeps) => masking(deps, deploy)

// `pnpm deploy:test`: main to the test site, run from the session after each merge. Install from the
// lockfile, build, migrate the test database, deploy, then the smoke test against the deployed URL.
// Any failure after the deploy (no URL, a failed smoke test, a crash) puts the previous version back
// and stops with what to put in a bug issue, also when the deploy step failed after making the new
// version live (release.ts). One test deploy at a time (lock.ts). The deploy output is masked. The
// very first test deploy is setup-cloudflare's (the same commands), so the first pull request has a
// Worker to preview on.
import type { DeployDeps } from './deps.ts'
import { oneAtATime } from './lock.ts'
import { deployAndVerify } from './release.ts'
import {
  clearRedirect,
  environment,
  gateEnv,
  headSha,
  installChromium,
  installDependencies,
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
  await installDependencies(deps)
  await installChromium(deps)
  try {
    // No SITE_URL: the test site is sent noindex everywhere.
    await step(deps, 'build for test', deps.run('pnpm', ['build'], TEST))
    // `-c wrangler.jsonc`: D1 commands read the source config, not the build's flattened copy.
    const migrate = ['d1', 'migrations', 'apply', 'DB', '--remote', '-c', 'wrangler.jsonc']
    await step(deps, 'apply the D1 migrations to test', deps.wrangler(migrate, TEST))
    const at = {
      env: TEST,
      worker: test.worker,
      sha,
      message: `main ${sha}`,
      what: 'deploy the test Worker',
      after: AFTER,
    }
    await deployAndVerify(deps, at, async (out) => {
      // TEST_APP_URL first, when set: the test site's own address. Else the workers.dev URL.
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

export const deployTest = (deps: DeployDeps) =>
  masking(deps, (masked) => oneAtATime(masked, 'test', 'pnpm deploy:test', () => deploy(masked)))

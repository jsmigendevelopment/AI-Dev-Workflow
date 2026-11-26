// `pnpm deploy:production --confirm "deploy production"`: main to production. Production is on the
// always-stop list: run it only after the person's yes. Without the typed confirmation it only says
// what it would do. Order: build (with SITE_URL), a D1 Time Travel bookmark (the restore point),
// migrate, deploy, smoke test. Any failure after the deploy (no URL, a failed smoke test, a crash)
// puts the previous version back and prints the command that would restore the data. Restoring data
// is never automatic: it is the person's call. The deploy output is masked.
// Until the person says go live, env.production.vars.LAUNCHED is "false" and the smoke test checks
// the Coming soon page; once it is "true", the real app.
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

export const CONFIRM = 'deploy production'
const PRODUCTION = targetEnv('production')

const PLAN = [
  'build main with CLOUDFLARE_ENV=production and SITE_URL',
  'take a D1 Time Travel bookmark (refuses to migrate without one)',
  'apply the D1 migrations to production',
  'deploy the production Worker',
  'smoke test it on workers.dev: the Coming soon page until LAUNCHED is "true", then the app',
  'on any failure after the deploy: roll the code back and print the restore command (data is the person’s call)',
]

const restore = (bookmark: string) =>
  `pnpm exec wrangler d1 time-travel restore DB --bookmark=${bookmark} --env production -c wrangler.jsonc`

/** The bookmark from `wrangler d1 time-travel info --json`: the JSON starts at the first `{`. */
function bookmarkOf(out: string): string | undefined {
  try {
    return (JSON.parse(out.slice(out.indexOf('{'))) as { bookmark?: string }).bookmark || undefined
  } catch {
    return undefined // no JSON in the output: the caller refuses to migrate
  }
}

/** What a stop after the deploy ends with: the rollback never touches data, and how to restore it. */
const afterText = (bookmark: string) =>
  'A rollback puts back code, never data. If a migration damaged the data, the person can restore the ' +
  `database to before this run (it overwrites every write since; ask first):\n  ${restore(bookmark)}`

async function deploy(deps: DeployDeps, confirm: string | undefined) {
  if (confirm !== CONFIRM) {
    deps.log(['Would deploy main to production:', ...PLAN.map((line) => `  - ${line}`)].join('\n'))
    throw new Stop(
      `production is the person's call (the always-stop list). After their yes: pnpm deploy:production --confirm "${CONFIRM}". Nothing was changed.`,
    )
  }
  await onCleanMain(deps)
  const production = environment(deps, 'production')
  const gate = gateEnv(deps, 'production', production.vars)
  const sha = (await headSha(deps)).slice(0, 7)
  const siteUrl = deps.local('SITE_URL')
  if (!siteUrl) deps.log('SITE_URL is not set: canonicals point at localhost and production is sent noindex.')
  await installChromium(deps)
  try {
    await step(
      deps,
      'build for production',
      deps.run('pnpm', ['build'], { ...PRODUCTION, SITE_URL: siteUrl }),
    )
    const info = ['d1', 'time-travel', 'info', 'DB', '-c', 'wrangler.jsonc', '--json']
    const bookmark = bookmarkOf(
      await step(deps, 'take a D1 Time Travel bookmark', deps.wrangler(info, PRODUCTION)),
    )
    if (!bookmark)
      throw new Stop('no bookmark: refusing to migrate without a restore point. Nothing was changed.')
    deps.log(`  restore point: ${bookmark}`)
    const migrate = ['d1', 'migrations', 'apply', 'DB', '--remote', '-c', 'wrangler.jsonc']
    await step(deps, 'apply the D1 migrations to production', deps.wrangler(migrate, PRODUCTION))
    const command = ['deploy', '--message', `production ${sha}`]
    const out = await step(deps, 'deploy the production Worker', deps.wrangler(command, PRODUCTION))
    const at = { env: PRODUCTION, worker: production.worker, sha, after: afterText(bookmark) }
    await afterDeploy(deps, at, async () => {
      // workers.dev first: it is outside the zone, so Bot Fight Mode never challenges the smoke test.
      const url = workersDevUrl(out) ?? deps.local('PRODUCTION_APP_URL')
      if (!url)
        throw new Stop(
          'no workers.dev URL in the deploy output, so nothing was smoke-tested. Set PRODUCTION_APP_URL.',
        )
      const launched = production.vars.LAUNCHED === 'true'
      const smoked = await smoke(deps, launched ? 'test:deployed' : 'test:coming-soon', url, gate)
      if (smoked.status !== 0) throw new Stop(`the production smoke test failed on ${url}:\n${tail(smoked)}`)
      deps.log(
        `Production: ${url} (main ${sha}, ${launched ? 'launched' : 'Coming soon'}). Smoke test passed.`,
      )
    })
  } finally {
    clearRedirect(deps)
  }
}

export const deployProduction = (deps: DeployDeps, confirm: string | undefined) =>
  masking(deps, (masked) => deploy(masked, confirm))

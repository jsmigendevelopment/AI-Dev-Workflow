// `pnpm deploy:production --confirm "deploy production"`: main to production. Production is on the
// always-stop list: run it only after the person's yes. Without the typed confirmation it only says
// what it would do. Order: install from the lockfile, build (with SITE_URL), a D1 Time Travel
// bookmark (the restore point), migrate, deploy, smoke test. A failed migration or deploy step prints
// the command that would restore the data. Any failure after the deploy (no URL, a failed smoke test,
// a crash) also puts the previous version back, as does a failed deploy step that made the new
// version live anyway (release.ts). One production deploy at a time (lock.ts). Restoring data is
// never automatic: it is the person's call. The deploy output is masked.
// Until the person says go live, env.production.vars.LAUNCHED is "false" and the smoke test checks
// the Coming soon page; once it is "true", the real app.
import type { DeployDeps } from './deps.ts'
import { oneAtATime } from './lock.ts'
import { deployAndVerify } from './release.ts'
import {
  clearRedirect,
  environment,
  failure,
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

export const CONFIRM = 'deploy production'
const PRODUCTION = targetEnv('production')

const PLAN = [
  'install dependencies from the lockfile (pnpm install --frozen-lockfile)',
  'build main with CLOUDFLARE_ENV=production and SITE_URL',
  'take a D1 Time Travel bookmark (refuses to migrate without one)',
  'apply the D1 migrations to production',
  'deploy the production Worker',
  'smoke test it on workers.dev: the Coming soon page until LAUNCHED is "true", then the app',
  'on a failed migration or deploy: print the restore command (data is the person’s call)',
  'on a failed deploy: check whether this run’s version went live anyway, and smoke-test it if so',
  'on any failure after the new version is live: also roll the code back',
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

/** How to put the data back to the bookmark. Printed, never run: restoring data is the person's call. */
const restoreText = (bookmark: string) =>
  'If a migration damaged the data, the person can restore the database to before this run ' +
  `(it overwrites every write since; ask first):\n  ${restore(bookmark)}`

/** What a stop after the deploy ends with: the rollback never touches data, and how to restore it. */
const afterText = (bookmark: string) => `A rollback puts back code, never data. ${restoreText(bookmark)}`

/** Migrates. A stop or crash also prints the restore command: a half-applied migration needs it most. */
async function migrate(deps: DeployDeps, bookmark: string) {
  try {
    const command = ['d1', 'migrations', 'apply', 'DB', '--remote', '-c', 'wrangler.jsonc']
    await step(deps, 'apply the D1 migrations to production', deps.wrangler(command, PRODUCTION))
  } catch (error) {
    throw new Stop(`${failure(error, 'before the deploy')}\n\n${restoreText(bookmark)}`)
  }
}

async function deploy(deps: DeployDeps) {
  await onCleanMain(deps)
  const production = environment(deps, 'production')
  const gate = gateEnv(deps, 'production', production.vars)
  const sha = (await headSha(deps)).slice(0, 7)
  const siteUrl = deps.local('SITE_URL')
  if (!siteUrl) deps.log('SITE_URL is not set: canonicals point at localhost and production is sent noindex.')
  await installDependencies(deps)
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
    await migrate(deps, bookmark)
    const at = {
      env: PRODUCTION,
      worker: production.worker,
      sha,
      site: 'production' as const,
      message: `production ${sha}`,
      what: 'deploy the production Worker',
      after: afterText(bookmark),
    }
    await deployAndVerify(deps, at, async (out) => {
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

export async function deployProduction(deps: DeployDeps, confirm: string | undefined) {
  if (confirm !== CONFIRM) {
    deps.log(['Would deploy main to production:', ...PLAN.map((line) => `  - ${line}`)].join('\n'))
    throw new Stop(
      `production is the person's call (the always-stop list). After their yes: pnpm deploy:production --confirm "${CONFIRM}". Nothing was changed.`,
    )
  }
  return masking(deps, (masked) =>
    oneAtATime(masked, 'production', 'pnpm deploy:production', () => deploy(masked)),
  )
}

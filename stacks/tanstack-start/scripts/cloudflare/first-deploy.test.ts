import { describe, expect, it } from 'vitest'

import { freshWorld, PACK_CONFIG, run, zeroTrust } from './fakes'

const SECRETS = '.agents/skills/secrets/scripts/push-secrets.mjs'
const files = (): Record<string, string> => ({ 'wrangler.jsonc': PACK_CONFIG, [SECRETS]: '' })
const CHECK = 'wrangler versions list --name app-test --json'
const BUILD = 'CLOUDFLARE_ENV=test pnpm build'
const MIGRATE = 'CLOUDFLARE_ENV=test wrangler d1 migrations apply DB --remote -c wrangler.jsonc'
const DEPLOY =
  'CLOUDFLARE_ENV=test wrangler deploy --message first test deploy (setup-cloudflare) --var LAUNCHED:false'
const isDeployStep = (c: string) => c.includes('pnpm build') || /wrangler (deploy|d1 migrations)/.test(c)

describe('the first test deploy', () => {
  it('a dry run checks for the test Worker and says what it would do, without doing it', async () => {
    const { code, calls, output } = await run(freshWorld(), files(), { dryRun: true })
    expect(code).toBe(0)
    expect(calls).toContain(CHECK)
    expect(calls.filter(isDeployStep)).toEqual([])
    expect(output()).toContain('would build with CLOUDFLARE_ENV=test, apply the D1 migrations to app-test')
    expect(output()).toContain('would deploy the test Worker app-test as the Coming soon page')
  })

  it('builds, migrates and deploys the test Worker as pnpm deploy:test does, before the secrets, never production', async () => {
    const world = freshWorld()
    const f = files()
    const { code, calls, output } = await run(world, f)
    expect(code).toBe(0)
    expect(calls.filter(isDeployStep)).toEqual([BUILD, MIGRATE, DEPLOY])
    expect(world.deployed).toEqual(['app-test'])
    expect(calls.filter(isDeployStep).join('\n')).not.toContain('production')
    // Secrets after the deploy: `wrangler secret put` on a missing Worker makes an empty placeholder.
    expect(calls.indexOf(DEPLOY)).toBeLessThan(calls.indexOf(`node ${SECRETS} --wrangler`))
    expect(calls.indexOf(DEPLOY)).toBeLessThan(
      calls.indexOf('gh secret set CLOUDFLARE_ACCOUNT_ID --env test'),
    )
    expect(f['.wrangler/deploy/config.json']).toBeUndefined()
    expect(output()).toContain('deployed: https://app-test.ann.workers.dev')

    const again = await run(world, f)
    expect(again.calls.filter(isDeployStep)).toEqual([])
    expect(again.output()).toContain('exists  test Worker app-test')
  })

  it('skips the deploy when the test Worker already exists', async () => {
    const world = { ...freshWorld(), deployed: ['app-test'] }
    const { calls, output } = await run(world, files())
    expect(calls).toContain(CHECK)
    expect(calls.filter(isDeployStep)).toEqual([])
    expect(output()).toContain('exists  test Worker app-test')
  })

  it('--no-first-deploy skips the check and the deploy, and says what previews need', async () => {
    const { code, calls, output } = await run(freshWorld(), files(), { noFirstDeploy: true })
    expect(code).toBe(0)
    expect(calls).not.toContain(CHECK)
    expect(calls.filter(isDeployStep)).toEqual([])
    expect(output()).toContain('Skipped (--no-first-deploy). Pull request previews fail')
  })

  it('stops at a failed step, names it, and changes nothing after it', async () => {
    const world = { ...freshWorld(), failing: 'deploy' }
    const failed = await run(world, files())
    expect(failed.code).toBe(1)
    expect(failed.output()).toContain('Stopped: the first test deploy failed at "wrangler deploy"')
    expect(failed.output()).toContain('run this again')
    expect(failed.calls.some((c) => c.startsWith('gh secret set') || c.startsWith('node '))).toBe(false)
    expect(world.deployed).toEqual([])

    const migrations = await run({ ...freshWorld(), failing: 'd1 migrations' }, files())
    expect(migrations.code).toBe(1)
    expect(migrations.calls.filter(isDeployStep)).toEqual([BUILD, MIGRATE])
    const build = await run({ ...freshWorld(), failing: 'pnpm build' }, files())
    expect(build.output()).toContain('failed at "pnpm build": vite build failed')
    expect(build.calls.filter(isDeployStep)).toEqual([BUILD])
  })

  it('stops when wrangler can’t tell whether the Worker exists, rather than guess', async () => {
    const { code, calls, output } = await run({ ...freshWorld(), versionsBroken: true }, files())
    expect(code).toBe(1)
    expect(output()).toContain('could not check whether the Worker app-test exists: ✘ [ERROR] fetch failed')
    expect(calls.filter(isDeployStep)).toEqual([])
  })
})

describe('the first test deploy and the test site’s protection', () => {
  const ACCESS = { CLOUDFLARE_ACCESS_TOKEN: 'set' }
  const opts = { protect: 'access' as const, allowEmails: ['ann@example.com'] }
  const noWorkers = () => ({ ...freshWorld(), access: { ...zeroTrust(), workers: [] } })

  it('a dry run plans Access on the Worker the deploy would make', async () => {
    const { code, writes, output } = await run(noWorkers(), files(), { ...opts, dryRun: true }, ACCESS)
    expect(code).toBe(0)
    expect(writes).toEqual([])
    expect(output()).toContain('Access attaches to app-test right after its first deploy (step 3)')
    expect(output()).toContain('would create the Access application "app-test (test and previews)"')
    expect(output()).not.toContain('not deployed yet')
  })

  it('deploys the Coming soon page first, then attaches Access to it in the same run', async () => {
    const world = noWorkers()
    const { code, calls, writes } = await run(world, files(), opts, ACCESS)
    expect(code).toBe(0)
    expect(calls).toContain(DEPLOY) // LAUNCHED:false: the app is not live until the first merge
    // The Access API listed no Worker before the deploy, so this id proves the order.
    expect(writes.at(-1)).toMatchObject({
      path: '/accounts/acc_1/access/apps',
      body: { destinations: [{ type: 'worker', worker_id: 'w_test' }] },
    })
  })

  it('the password gate goes on the deployed Worker, not on an empty placeholder', async () => {
    const { calls } = await run(freshWorld(), files(), { protect: 'password' })
    expect(calls.indexOf(DEPLOY)).toBeGreaterThan(-1)
    expect(calls.indexOf(DEPLOY)).toBeLessThan(
      calls.indexOf('wrangler secret put SITE_PASSWORD --env test <stdin>'),
    )
  })
})

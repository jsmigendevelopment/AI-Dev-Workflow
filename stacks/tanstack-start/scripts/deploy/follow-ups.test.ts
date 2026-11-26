// #150: a `wrangler deploy` that fails part-way, masking the gate values by value, one deploy at a
// time, and the pinned pnpm. All over the fakes: no real wrangler, no Cloudflare call.
import { describe, expect, it } from 'vitest'

import type { DeployDeps } from './deps'
import { attempt, freshPlace, type Place, withVars } from './fakes'
import { deployPreview } from './preview'
import { CONFIRM, deployProduction } from './production'
import { deployTest } from './test-site'

const DEPLOYS = [
  {
    name: 'deploy:test',
    deploy: deployTest,
    env: 'CLOUDFLARE_ENV=test',
    worker: 'app-test',
    message: 'main abc1234',
    urlVar: 'TEST_APP_URL',
  },
  {
    name: 'deploy:production',
    deploy: (deps: DeployDeps) => deployProduction(deps, CONFIRM),
    env: 'CLOUDFLARE_ENV=production',
    worker: 'app-production',
    message: 'production abc1234',
    urlVar: 'PRODUCTION_APP_URL',
  },
]
const PREVIEW = (deps: DeployDeps) => deployPreview(deps, '12')
const ALL = [...DEPLOYS, { name: 'deploy:preview', deploy: PREVIEW }]
const RESTORE =
  'pnpm exec wrangler d1 time-travel restore DB --bookmark=bm-42 --env production -c wrangler.jsonc'
const URL = 'https://app.example.dev'

describe.each(DEPLOYS)(
  'pnpm $name when wrangler deploy fails',
  ({ name, deploy, env, worker, message, urlVar }) => {
    const rollback = `${env} wrangler rollback --yes --message smoke failed on abc1234`
    const list = `${env} wrangler deployments list --name ${worker} --json`
    const run = (over: Partial<Place>) => attempt(freshPlace({ local: { [urlVar]: URL }, ...over }), deploy)
    const smoked = (calls: string[]) => calls.filter((c) => c.includes(`BASE_URL=${URL} pnpm test:`))
    const rolledBack = (calls: string[]) => calls.filter((c) => c.includes('wrangler rollback'))

    it('AC-150-1: WHEN it fails after making this run’s version live and the smoke test fails THEN it smoke-tests that version and rolls it back', async () => {
      const { code, calls, stopped } = await run({ partWay: true, smokePasses: false })
      expect(code).toBe(1)
      expect(calls).toContain(list)
      expect(smoked(calls)).toHaveLength(1)
      expect(calls.at(-1)).toBe(rollback)
      expect(stopped).toContain('"deploy the')
      expect(stopped).toContain('/workers/routes) failed')
      expect(stopped).toContain(`went live anyway (the newest deployment of ${worker} is "${message}")`)
      expect(stopped).toContain('Rolled back: the previous version is serving again.')
      if (name === 'deploy:production') expect(stopped).toContain(RESTORE)
    })

    it('AC-150-1: WHEN it fails after making this run’s version live and the smoke test passes THEN it keeps that version and still stops', async () => {
      const { code, calls, stopped } = await run({ partWay: true })
      expect(code).toBe(1)
      expect(smoked(calls)).toHaveLength(1)
      expect(rolledBack(calls)).toEqual([])
      expect(stopped).toContain('passed its smoke test, so it stays')
      expect(stopped).toContain('routes, custom domains and crons')
    })

    it('AC-150-1: WHEN this run’s version went live but there is no URL to smoke-test THEN it rolls it back', async () => {
      const { code, calls, stopped } = await run({ partWay: true, local: {} })
      expect(code).toBe(1)
      expect(calls.at(-1)).toBe(rollback)
      expect(stopped).toContain('nothing was smoke-tested')
    })

    it('AC-150-1: WHEN it fails or crashes and the newest deployment isn’t this run’s THEN it never smoke-tests or rolls back', async () => {
      for (const over of [
        { failing: 'wrangler deploy --message' },
        { crashing: 'wrangler deploy --message' },
      ]) {
        const { code, calls, stopped } = await run(over)
        expect(code).toBe(1)
        expect(calls).toContain(list)
        expect(smoked(calls)).toEqual([])
        expect(rolledBack(calls)).toEqual([])
        expect(stopped).toContain(
          `Nothing new went live: the newest deployment of ${worker} isn't "${message}"`,
        )
        if (name === 'deploy:production') expect(stopped).toContain(RESTORE)
      }
    })

    it('AC-150-1: WHEN no deployment is listed at all THEN it never rolls back', async () => {
      const { code, calls, stopped } = await run({ failing: 'wrangler deploy --message', live: undefined })
      expect(code).toBe(1)
      expect(rolledBack(calls)).toEqual([])
      expect(stopped).toContain('Nothing new went live')
    })

    it('AC-150-1: WHEN the deployments can’t be read THEN it never rolls back, and says how to check', async () => {
      for (const over of [{ failing: 'wrangler deploy' }, { crashing: 'wrangler deploy' }]) {
        const { code, calls, stopped } = await run(over)
        expect(code).toBe(1)
        expect(smoked(calls)).toEqual([])
        expect(rolledBack(calls)).toEqual([])
        expect(stopped).toContain("Couldn't tell whether this run's version went live")
        expect(stopped).toContain(`pnpm exec wrangler deployments list --name ${worker}`)
        expect(stopped).toContain(`pnpm exec wrangler rollback --name ${worker}`)
      }
    })
  },
)

describe('deploy output masks the protection’s values by value', () => {
  const gate = {
    TEST_CF_ACCESS_CLIENT_ID: 'gate-id-1111.access',
    TEST_CF_ACCESS_CLIENT_SECRET: 'gate-secret-2222',
    TEST_SITE_PASSWORD: 'gate+pass/3333',
    PRODUCTION_CF_ACCESS_CLIENT_ID: 'gate-id-4444.access',
    PRODUCTION_CF_ACCESS_CLIENT_SECRET: 'gate-secret-5555',
  }
  const values = Object.values(gate)
  const echo = [...values, ...values.map(encodeURIComponent)].join(' ')
  // Masking by name sees only these names: none of them looks secret.
  const listed = values.map((value, i): [string, string] => [`SMOKE_VALUE_${i}`, value])
  const access = withVars('test', '"LAUNCHED": "true", "SITE_PROTECTION": "access"').replace(
    '"vars": { "LAUNCHED": "false", "SITE_PROTECTION": "none" }',
    '"vars": { "LAUNCHED": "false", "SITE_PROTECTION": "access" }',
  )
  const runs: [string, Partial<Place>, (deps: DeployDeps) => Promise<void>][] = [
    ['a failed smoke test, then a failed rollback', { smokePasses: false, failing: 'rollback' }, deployTest],
    ['a failed production smoke test', { smokePasses: false }, (deps) => deployProduction(deps, CONFIRM)],
    ['a failed preview upload', { failing: 'versions upload' }, PREVIEW],
  ]

  it.each(runs)(
    'AC-150-2: WHEN the gate values sit under names that don’t look secret THEN they never print, after %s',
    async (_what, over, deploy) => {
      const place = freshPlace({
        ...over,
        echo,
        local: { ...gate },
        listed,
        files: { 'wrangler.jsonc': access },
      })
      const { code, stopped, output } = await attempt(place, deploy)
      expect(code).toBe(1)
      expect(stopped).toContain('***')
      for (const value of [...values, ...values.map(encodeURIComponent)]) {
        expect(stopped).not.toContain(value)
        expect(output()).not.toContain(value)
      }
    },
  )
})

describe.each(ALL)('pnpm $name runs one at a time', ({ name, deploy }) => {
  const lock = `.git/onrails-${name.replace(':', '-')}${name === 'deploy:preview' ? '-12' : ''}.lock`
  const writes = (calls: string[]) =>
    calls.filter((c) =>
      /pnpm (install|build)|wrangler (deploy|versions upload|d1 migrations|rollback)/.test(c),
    )

  it('AC-150-7: WHEN another deploy of it is running THEN it stops before it changes anything', async () => {
    const place = freshPlace({ running: [777] })
    place.files[lock] = '777 2026-11-26T10:00:00Z'
    const { code, calls, stopped } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('another pnpm')
    expect(stopped).toContain('(PID 777')
    expect(writes(calls)).toEqual([])
    expect(place.files[lock]).toBe('777 2026-11-26T10:00:00Z')
  })

  it('AC-150-7: WHEN a lock is left by a run that ended THEN it takes it over, and frees it after', async () => {
    const place = freshPlace()
    place.files[lock] = '777 2026-11-26T10:00:00Z'
    const { code } = await attempt(place, deploy)
    expect(code).toBe(0)
    expect(place.files[lock]).toBeUndefined()
  })

  it('AC-150-7: WHEN it fails THEN it still frees the lock', async () => {
    const place = freshPlace({ failing: 'pnpm build' })
    const { code } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(place.files[lock]).toBeUndefined()
  })
})

describe.each(ALL)('pnpm $name runs the pinned pnpm', ({ deploy }) => {
  it('AC-150-8: WHEN the pnpm on PATH isn’t the version package.json pins THEN it stops before it installs anything', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ pnpm: '10.28.0' }), deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('pnpm 10.28.0 is first on PATH, and package.json pins pnpm@12.21.0')
    expect(calls.filter((c) => /pnpm (install|build)|wrangler /.test(c))).toEqual([])
  })
})

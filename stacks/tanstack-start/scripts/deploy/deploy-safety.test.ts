// The deploys' safety rules: a version this run made live doesn't stay without a passing smoke test
// (a part-way `wrangler deploy` is in follow-ups.test.ts), only GitHub's main deploys, and no secret
// value reaches the output.
import { describe, expect, it } from 'vitest'

import type { DeployDeps } from './deps'
import { attempt, freshPlace, type Place, withVars } from './fakes'
import { deployPreview } from './preview'
import { CONFIRM, deployProduction } from './production'
import { deployTest } from './test-site'

const DEPLOYS = [
  { name: 'deploy:test', deploy: deployTest, env: 'CLOUDFLARE_ENV=test', worker: 'app-test' },
  {
    name: 'deploy:production',
    deploy: (deps: DeployDeps) => deployProduction(deps, CONFIRM),
    env: 'CLOUDFLARE_ENV=production',
    worker: 'app-production',
  },
]
const FETCH = 'git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main'
const writes = (calls: string[]) =>
  calls.filter((c) => /pnpm build|wrangler (deploy|versions upload|d1 migrations|rollback)/.test(c))

describe.each(DEPLOYS)('pnpm $name after a successful wrangler deploy', ({ deploy, env, worker }) => {
  const rollback = `${env} wrangler rollback --yes --message smoke failed on abc1234`
  const after = async (over: Partial<Place>) => attempt(freshPlace(over), deploy)

  it('installs Chromium before anything is written, so a failed install deploys nothing', async () => {
    const { code, calls, stopped } = await after({ failing: 'playwright install' })
    expect(code).toBe(1)
    expect(stopped).toContain('"install Chromium" failed')
    expect(writes(calls)).toEqual([])
  })

  it('rolls back when the deploy output has no URL to smoke-test', async () => {
    const { code, calls, stopped } = await after({ deployPrints: 'Uploaded\n' })
    expect(code).toBe(1)
    expect(writes(calls).at(-1)).toBe(rollback)
    expect(stopped).toMatch(/no (workers\.dev )?URL in the deploy output, so nothing was smoke-tested/)
    expect(stopped).toContain('Rolled back: the previous version is serving again.')
  })

  it('rolls back when the smoke test crashes instead of failing', async () => {
    const { code, calls, stopped } = await after({ crashing: 'pnpm test:' })
    expect(code).toBe(1)
    expect(writes(calls).at(-1)).toBe(rollback)
    expect(stopped).toContain('the deploy script crashed after the deploy')
    expect(stopped).toContain('Rolled back')
  })

  it('says plainly that the new version is live and untested when the rollback fails or crashes too', async () => {
    for (const over of [{ failing: 'wrangler rollback' }, { crashing: 'wrangler rollback' }]) {
      const { code, stopped } = await after({ smokePasses: false, ...over })
      expect(code).toBe(1)
      expect(stopped).toContain('The rollback failed too')
      expect(stopped).toContain(`The new version (abc1234) is live on ${worker} and untested.`)
      expect(stopped).toContain(`pnpm exec wrangler rollback --name ${worker}`)
    }
  })
})

describe('pnpm deploy:production after a successful wrangler deploy', () => {
  it('prints the restore point on every failure after the deploy, and never runs it', async () => {
    for (const over of [{ deployPrints: 'Uploaded\n' }, { crashing: 'pnpm test:' }, { smokePasses: false }]) {
      const { calls, stopped } = await attempt(freshPlace(over), (deps) => deployProduction(deps, CONFIRM))
      expect(stopped).toContain(
        'pnpm exec wrangler d1 time-travel restore DB --bookmark=bm-42 --env production -c wrangler.jsonc',
      )
      expect(calls.join('\n')).not.toContain('time-travel restore')
    }
  })
})

describe('pnpm deploy:production after the bookmark, before the deploy succeeds', () => {
  it('prints the restore command when the migration or the deploy step fails or crashes, and never runs it', async () => {
    const steps = ['d1 migrations apply', 'wrangler deploy']
    for (const over of steps.flatMap((s) => [{ failing: s }, { crashing: s }])) {
      const { code, calls, stopped } = await attempt(freshPlace(over), (deps) =>
        deployProduction(deps, CONFIRM),
      )
      expect(code).toBe(1)
      expect(stopped).toContain(
        'pnpm exec wrangler d1 time-travel restore DB --bookmark=bm-42 --env production -c wrangler.jsonc',
      )
      expect(stopped).toContain(over.failing ? 'broke' : 'crashed')
      expect(calls.join('\n')).not.toMatch(/time-travel restore|wrangler rollback/)
    }
  })
})

describe.each(DEPLOYS)('pnpm $name deploys only what is on GitHub’s main', ({ deploy }) => {
  it('fetches main and goes on when this checkout is exactly GitHub’s main', async () => {
    const { code, calls } = await attempt(freshPlace(), deploy)
    expect(code).toBe(0)
    expect(calls.indexOf(FETCH)).toBeGreaterThan(-1)
    expect(calls.indexOf(FETCH)).toBeLessThan(calls.findIndex((c) => c.includes('pnpm build')))
  })

  it('deploys nothing when this main is behind GitHub’s main', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ remoteMain: 'fff0000aaaa' }), deploy)
    expect(code).toBe(1)
    expect(stopped).toContain("this checkout of main (abc1234) is behind GitHub's main (fff0000)")
    expect(stopped).toContain('git pull --ff-only')
    expect(writes(calls)).toEqual([])
  })

  it('deploys nothing when this main has a commit GitHub’s main doesn’t', async () => {
    const place = freshPlace({ remoteMain: 'fff0000aaaa', localOnly: true })
    const { code, calls, stopped } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(stopped).toContain(
      "has commits that aren't on GitHub's main (fff0000), so they were never reviewed",
    )
    expect(writes(calls)).toEqual([])
  })

  it('deploys nothing when GitHub’s main can’t be fetched', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ failing: 'git fetch' }), deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('could not fetch main from GitHub')
    expect(writes(calls)).toEqual([])
  })
})

const ALL = [...DEPLOYS, { name: 'deploy:preview', deploy: (deps: DeployDeps) => deployPreview(deps, '12') }]

describe.each(ALL)('pnpm $name installs from the lockfile first', ({ deploy }) => {
  it('runs pnpm install --frozen-lockfile before anything runs from node_modules', async () => {
    const { code, calls } = await attempt(freshPlace(), deploy)
    expect(code).toBe(0)
    const install = calls.indexOf('pnpm install --frozen-lockfile')
    expect(install).toBeGreaterThan(-1)
    expect(install).toBeLessThan(calls.findIndex((c) => /pnpm (build|exec|test:)|wrangler /.test(c)))
  })

  it('writes nothing when the install fails', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ failing: 'pnpm install' }), deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('"install dependencies from the lockfile" failed')
    expect(writes(calls)).toEqual([])
  })
})

describe('deploy output is masked', () => {
  // Planted values: the protection's (test and production), tokens, and one that a URL would encode.
  const planted = {
    TEST_CF_ACCESS_CLIENT_ID: 'planted-id-1111.access',
    TEST_CF_ACCESS_CLIENT_SECRET: 'planted-secret-2222',
    TEST_SITE_PASSWORD: 'planted-pass-3333',
    PRODUCTION_CF_ACCESS_CLIENT_ID: 'planted-id-4444.access',
    PRODUCTION_CF_ACCESS_CLIENT_SECRET: 'planted-secret-5555',
    CLOUDFLARE_API_TOKEN: 'planted-token-6666',
    GITHUB_TOKEN: 'planted+gh/7777',
  }
  const values = Object.values(planted)
  const echo = [...values, ...values.map(encodeURIComponent)].join(' ')
  // Access in front of the test site and all of production.
  const config = withVars('test', '"LAUNCHED": "true", "SITE_PROTECTION": "access"').replace(
    '"vars": { "LAUNCHED": "false", "SITE_PROTECTION": "none" }',
    '"vars": { "LAUNCHED": "false", "SITE_PROTECTION": "access" }',
  )
  const files = { 'wrangler.jsonc': config }
  const runs: [string, Partial<Place>, (deps: DeployDeps) => Promise<void>][] = [
    ['a failed smoke test, then a failed rollback', { smokePasses: false, failing: 'rollback' }, deployTest],
    ['a failed production smoke test', { smokePasses: false }, (deps) => deployProduction(deps, CONFIRM)],
    ['a failed build', { failing: 'pnpm build' }, deployTest],
    ['a crashed smoke test', { crashing: 'pnpm test:' }, deployTest],
    ['a failed preview upload', { failing: 'versions upload' }, (deps) => deployPreview(deps, '12')],
  ]

  it.each(runs)('never prints a secret value after %s', async (_what, over, deploy) => {
    const place = freshPlace({ ...over, echo, local: { ...planted }, files: { ...files } })
    const { code, calls, stopped, output } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('***')
    for (const value of [...values, ...values.map(encodeURIComponent)]) {
      expect(stopped).not.toContain(value)
      expect(output()).not.toContain(value)
    }
    // The commands themselves still get the real values.
    if (over.smokePasses === false)
      expect(calls.join('\n')).toContain('CF_ACCESS_CLIENT_SECRET=planted-secret-')
  })
})

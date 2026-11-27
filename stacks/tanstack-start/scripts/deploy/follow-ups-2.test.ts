// #170: a first test deploy that goes live untagged, and deployments without an id. All over the
// fakes: no real wrangler, no Cloudflare call.
import { describe, expect, it } from 'vitest'

import type { DeployDeps } from './deps'
import { attempt, freshPlace } from './fakes'
import { CONFIRM, deployProduction } from './production'
import { deployTest } from './test-site'

const rolledBack = (calls: string[]) => calls.filter((c) => c.includes('wrangler rollback'))

describe('pnpm deploy:test, a first deploy that goes live untagged', () => {
  it('AC-170-2: WHEN a first deploy on test goes live untagged THEN the stop doesn’t mention the main <sha> message or the Coming soon page', async () => {
    const place = freshPlace({ workers: [], live: undefined, partWay: true, untagged: true })
    const { code, calls, stopped } = await attempt(place, deployTest)
    expect(code).toBe(1)
    expect(rolledBack(calls)).toEqual([])
    expect(stopped).toContain("Couldn't tell whether this run's version went live")
    expect(stopped).not.toContain('"main abc1234"')
    expect(stopped).not.toContain('Coming soon')
    expect(stopped).toContain('The test Worker ships launched')
  })

  it('AC-170-2: WHEN a first production deploy fails its smoke test THEN it still says to keep the Coming soon page', async () => {
    const place = freshPlace({ workers: [], live: undefined, smokePasses: false })
    const { code, stopped } = await attempt(place, (deps) => deployProduction(deps, CONFIRM))
    expect(code).toBe(1)
    expect(stopped).toContain('Keep the site on its Coming soon page')
  })
})

describe.each([
  { name: 'deploy:test', deploy: deployTest, message: 'main abc1234' },
  {
    name: 'deploy:production',
    deploy: (deps: DeployDeps) => deployProduction(deps, CONFIRM),
    message: 'production abc1234',
  },
])('pnpm $name with deployments that have no id', ({ deploy, message }) => {
  it('AC-170-3: WHEN the deployments list has entries without an id THEN a failed deploy reports couldn’t tell and never rolls back', async () => {
    for (const partWay of [true, false]) {
      const over = partWay ? { partWay } : { live: message, failing: 'wrangler deploy --message' }
      const { code, calls, stopped } = await attempt(freshPlace({ noIds: true, ...over }), deploy)
      expect(code).toBe(1)
      expect(rolledBack(calls)).toEqual([])
      expect(calls.filter((c) => / pnpm test:/.test(c))).toEqual([])
      expect(stopped).toContain("Couldn't tell whether this run's version went live")
      expect(stopped).toContain('has no id')
      expect(stopped).not.toContain('Nothing new went live')
    }
  })
})

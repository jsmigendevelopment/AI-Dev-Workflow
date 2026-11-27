// #150 and #170: one deploy at a time, over the fakes: no real wrangler, no Cloudflare call.
import { describe, expect, it } from 'vitest'

import type { DeployDeps } from './deps'
import { attempt, freshPlace } from './fakes'
import { deployPreview } from './preview'
import { CONFIRM, deployProduction } from './production'
import { deployTest } from './test-site'

const ALL = [
  { name: 'deploy:test', deploy: deployTest },
  { name: 'deploy:production', deploy: (deps: DeployDeps) => deployProduction(deps, CONFIRM) },
  { name: 'deploy:preview', deploy: (deps: DeployDeps) => deployPreview(deps, '12') },
]

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

  it('AC-150-7: WHEN another run takes over the same ended run’s lock first THEN it stops and leaves that run’s lock', async () => {
    const place = freshPlace()
    place.files[lock] = '777 2026-11-26T10:00:00Z'
    const other = '888 2026-11-26T10:05:00Z'
    // The other run takes over while this one checks whether PID 777 is still running.
    const racing = (deps: DeployDeps) =>
      deploy({ ...deps, alive: () => ((place.files[lock] = other), false) })
    const { code, calls, stopped } = await attempt(place, racing)
    expect(code).toBe(1)
    expect(stopped).toContain('took the lock')
    expect(writes(calls)).toEqual([])
    expect(place.files[lock]).toBe(other)
    expect(place.files[`${lock}.takeover`]).toBeUndefined()
  })

  it('AC-150-7: WHEN another run is taking over the ended run’s lock right now THEN it stops before it changes anything', async () => {
    const place = freshPlace()
    place.files[lock] = '777 2026-11-26T10:00:00Z'
    place.files[`${lock}.takeover`] = `888 ${new Date().toISOString()}`
    const { code, calls, stopped } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(stopped).toContain('took the lock')
    expect(stopped).toContain(`delete ${lock}.takeover`)
    expect(writes(calls)).toEqual([])
    expect(place.files[lock]).toBe('777 2026-11-26T10:00:00Z')
  })

  it('AC-170-1: WHEN a .takeover file is older than the deploy timeout THEN the stop gives its age and the file to delete', async () => {
    const place = freshPlace()
    const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
    place.files[lock] = '777 2026-11-26T10:00:00Z'
    place.files[`${lock}.takeover`] = `888 ${since}`
    const { code, calls, stopped } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(stopped).toContain(`left ${lock}.takeover 3 days ago (since ${since})`)
    expect(stopped).toContain(`Delete ${lock}.takeover`)
    expect(stopped).not.toContain('just now')
    expect(writes(calls)).toEqual([])
  })

  it('AC-150-7: WHEN the lock file isn’t one a deploy wrote THEN it stops, says to delete it by hand, and never prints what it holds', async () => {
    for (const text of ['777 2026-11-26T10:00:00Z extra', 'TOKEN=planted-value-1234', '', undefined]) {
      const place = freshPlace()
      place.files[lock] = text ?? '777 2026-11-26T10:00:00Z'
      // undefined: a link, or not a plain file, which the real reader refuses (lock.test.ts).
      const linked = (deps: DeployDeps) =>
        deploy(text === undefined ? { ...deps, readPlain: () => undefined } : deps)
      const { code, calls, stopped, output } = await attempt(place, linked)
      expect(code).toBe(1)
      expect(stopped).toContain(`the deploy lock ${lock} isn't one this script wrote`)
      expect(stopped).toContain('delete it by hand')
      expect(`${stopped}\n${output()}`).not.toMatch(/planted|extra|PID 777/)
      expect(writes(calls)).toEqual([])
    }
  })

  it('AC-150-7: WHEN it fails THEN it still frees the lock', async () => {
    const place = freshPlace({ failing: 'pnpm build' })
    const { code } = await attempt(place, deploy)
    expect(code).toBe(1)
    expect(place.files[lock]).toBeUndefined()
  })
})

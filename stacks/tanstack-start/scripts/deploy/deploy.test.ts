import { describe, expect, it } from 'vitest'

import { attempt, BASE, freshPlace, HEAD, withVars } from './fakes'
import { deployPreview } from './preview'
import { CONFIRM, deployProduction } from './production'
import { deployTest } from './test-site'

const T = 'CLOUDFLARE_ENV=test'
const P = 'CLOUDFLARE_ENV=production'
const preview =
  (pr = '12') =>
  (deps: Parameters<typeof deployPreview>[0]) =>
    deployPreview(deps, pr)
const production = (confirm?: string) => (deps: Parameters<typeof deployProduction>[0]) =>
  deployProduction(deps, confirm)
// `wrangler deploy ` with its space: the read-only `wrangler deployments list` changes nothing.
const changes = (calls: string[]) =>
  calls.filter((c) =>
    /pnpm build|wrangler (deploy |versions upload|d1 migrations|rollback)|-X (POST|PATCH)/.test(c),
  )

describe('pnpm deploy:preview', () => {
  it('uploads a version of the test Worker under pr-<n>, checks it answers, and posts one comment', async () => {
    const place = freshPlace()
    const { code, calls, output } = await attempt(place, preview())
    expect(code).toBe(0)
    expect(changes(calls)).toEqual([
      `${T} pnpm build`,
      `${T} wrangler versions upload --preview-alias pr-12 --message PR #12 abc1234`,
      expect.stringMatching(/^gh api -X POST repos\/\{owner\}\/\{repo\}\/issues\/12\/comments -f body=/),
    ])
    expect(place.comments).toEqual([
      ['ann', expect.stringContaining('**Preview:** https://pr-12-app-test.ann.workers.dev')],
    ])
    expect(place.comments[0]![1]).toContain('Commit abc1234. Runs on the **test** database and test keys.')
    expect(output()).toContain('Preview of #12: https://pr-12-app-test.ann.workers.dev')
    expect(calls.join('\n')).not.toMatch(/production|wrangler deploy|migrations apply/)
    expect(place.files['.wrangler/deploy/config.json']).toBeUndefined()
  })

  it('updates its own comment on the next run instead of adding a second one', async () => {
    const place = freshPlace({
      comments: [
        ['bob', 'Looks good'],
        ['ann', '<!-- preview-url -->\nold'],
      ],
    })
    const { code, calls } = await attempt(place, preview())
    expect(code).toBe(0)
    expect(calls).toContainEqual(
      expect.stringMatching(/^gh api -X PATCH repos\/\{owner\}\/\{repo\}\/issues\/comments\/2 /),
    )
    expect(place.comments).toHaveLength(2)
    expect(place.comments[1]![1]).toContain('pr-12-app-test')
  })

  it('warns in the comment when the pull request adds a migration, diffed against its base', async () => {
    const place = freshPlace({ migrations: ['migrations/0002_tags.sql'] })
    const { calls } = await attempt(place, preview())
    expect(calls).toContain(`git diff --no-renames --name-only ${BASE}...HEAD -- migrations`)
    expect(place.comments[0]![1]).toContain('This pull request adds a migration.')
  })

  it('skips forks and lane:tiny without building anything', async () => {
    for (const pr of [
      { headSha: HEAD, fork: true, labels: [] },
      { headSha: HEAD, fork: false, labels: ['lane:tiny'] },
    ]) {
      const { code, calls, output } = await attempt(freshPlace({ pr }), preview())
      expect(code).toBe(0)
      expect(changes(calls)).toEqual([])
      expect(output()).toMatch(/^Skipped: #12/m)
    }
  })

  it('previews only the exact head of the pull request', async () => {
    const { code, stopped, calls } = await attempt(freshPlace({ head: 'fff0000' }), preview())
    expect(code).toBe(1)
    expect(stopped).toContain('git fetch origin pull/12/head && git switch --detach FETCH_HEAD')
    expect(changes(calls)).toEqual([])
  })

  it('uploads nothing and posts no comment when the checkout has uncommitted changes, or git can’t tell', async () => {
    for (const over of [{ dirty: true }, { failing: 'git status' }]) {
      const place = freshPlace(over)
      const { code, stopped, calls } = await attempt(place, preview())
      expect(code).toBe(1)
      expect(stopped).toContain('uncommitted changes')
      expect(stopped).toContain('A preview of #12 must be exactly its commit')
      expect(changes(calls)).toEqual([])
      expect(place.comments).toEqual([])
    }
  })

  it('stops with the fix when the test Worker does not exist yet', async () => {
    const { code, stopped, calls } = await attempt(freshPlace({ workers: [] }), preview())
    expect(code).toBe(1)
    expect(stopped).toContain("the test Worker app-test doesn't exist yet")
    expect(stopped).toContain('node scripts/setup-cloudflare.mjs')
    expect(changes(calls)).toEqual([])
  })

  it('stops, rather than guess, when wrangler can’t tell whether the test Worker exists', async () => {
    const { code, stopped, calls } = await attempt(freshPlace({ failing: 'versions list' }), preview())
    expect(code).toBe(1)
    expect(stopped).toContain('could not check whether the Worker app-test exists')
    expect(changes(calls)).toEqual([])
  })

  it('needs a number', async () => {
    const { code, stopped } = await attempt(freshPlace(), preview('abc'))
    expect(code).toBe(1)
    expect(stopped).toContain('pnpm deploy:preview <n>')
  })

  it('on a protected test site: stops before building without its values, and sends them when set', async () => {
    const files = { 'wrangler.jsonc': withVars('test', '"LAUNCHED": "true", "SITE_PROTECTION": "access"') }
    const missing = await attempt(freshPlace({ files: { ...files } }), preview())
    expect(missing.code).toBe(1)
    expect(missing.stopped).toContain('TEST_CF_ACCESS_CLIENT_ID and TEST_CF_ACCESS_CLIENT_SECRET')
    expect(changes(missing.calls)).toEqual([])

    const local = { TEST_CF_ACCESS_CLIENT_ID: 'id.access', TEST_CF_ACCESS_CLIENT_SECRET: 's3cret' }
    const set = await attempt(freshPlace({ files: { ...files }, local }), preview())
    expect(set.code).toBe(0)
    expect(set.tries[0]).toEqual({ 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 's3cret' })
    expect(set.output()).not.toContain('s3cret')
  })

  it('stops when the preview never answers 200, after six tries', async () => {
    const place = freshPlace({ answers: [503] })
    const { code, stopped, tries } = await attempt(place, preview())
    expect(code).toBe(1)
    expect(tries).toHaveLength(6)
    expect(stopped).toContain('answered 503, not 200')
    expect(place.comments).toEqual([])
  })
})

describe('pnpm deploy:test', () => {
  it('builds, migrates and deploys main to the test Worker, then smoke-tests the deployed URL', async () => {
    const place = freshPlace()
    const { code, calls, output } = await attempt(place, deployTest)
    expect(code).toBe(0)
    expect(changes(calls)).toEqual([
      `${T} pnpm build`,
      `${T} wrangler d1 migrations apply DB --remote -c wrangler.jsonc`,
      `${T} wrangler deploy --message main abc1234`,
    ])
    expect(calls).toContain('BASE_URL=https://app-x.ann.workers.dev pnpm test:deployed')
    expect(calls.indexOf(`${T} wrangler deploy --message main abc1234`)).toBeLessThan(
      calls.indexOf('BASE_URL=https://app-x.ann.workers.dev pnpm test:deployed'),
    )
    expect(output()).toContain('Smoke test passed.')
    expect(calls.join('\n')).not.toContain('production')
    expect(place.files['.wrangler/deploy/config.json']).toBeUndefined()
  })

  it('goes out only from a clean checkout of main', async () => {
    for (const over of [{ branch: 'feat/12-tags' }, { dirty: true }, { failing: 'git status' }]) {
      const { code, stopped, calls } = await attempt(freshPlace(over), deployTest)
      expect(code).toBe(1)
      expect(stopped).toMatch(/git switch main|uncommitted changes/)
      expect(changes(calls)).toEqual([])
    }
  })

  it('rolls back a failed smoke test and says what to put in the bug issue', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ smokePasses: false }), deployTest)
    expect(code).toBe(1)
    expect(changes(calls).at(-1)).toBe(`${T} wrangler rollback --yes --message smoke failed on abc1234`)
    expect(stopped).toContain('home page answers 500')
    expect(stopped).toContain('Rolled back')
    expect(stopped).toContain('needs-human')
  })

  it('stops at a failed step, names it, and deploys nothing after it', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ failing: 'd1 migrations' }), deployTest)
    expect(code).toBe(1)
    expect(stopped).toContain('"apply the D1 migrations to test" failed')
    expect(changes(calls)).toEqual([
      `${T} pnpm build`,
      `${T} wrangler d1 migrations apply DB --remote -c wrangler.jsonc`,
    ])
  })

  it('on a password-gated test site, needs TEST_SITE_PASSWORD (or SITE_PASSWORD) and hands it to the smoke test', async () => {
    const files = { 'wrangler.jsonc': withVars('test', '"LAUNCHED": "true", "SITE_PROTECTION": "password"') }
    const missing = await attempt(freshPlace({ files: { ...files } }), deployTest)
    expect(missing.stopped).toContain('TEST_SITE_PASSWORD')
    expect(changes(missing.calls)).toEqual([])
    const set = await attempt(freshPlace({ files: { ...files }, local: { SITE_PASSWORD: 'pw' } }), deployTest)
    expect(set.code).toBe(0)
    expect(set.calls).toContain('BASE_URL=https://app-x.ann.workers.dev SITE_PASSWORD=pw pnpm test:deployed')
  })
})

describe('pnpm deploy:production', () => {
  it('without the typed confirmation only says what it would do', async () => {
    const { code, calls, stopped, output } = await attempt(freshPlace(), production())
    expect(code).toBe(1)
    expect(calls).toEqual([])
    expect(output()).toContain('take a D1 Time Travel bookmark')
    expect(stopped).toContain(`pnpm deploy:production --confirm "${CONFIRM}"`)
    expect((await attempt(freshPlace(), production('yes'))).calls).toEqual([])
  })

  it('builds with SITE_URL, bookmarks before migrating, deploys, then checks the Coming soon page', async () => {
    const place = freshPlace({ local: { SITE_URL: 'https://app.example.com' } })
    const { code, calls, output } = await attempt(place, production(CONFIRM))
    expect(code).toBe(0)
    const bookmark = `${P} wrangler d1 time-travel info DB -c wrangler.jsonc --json`
    expect(changes(calls)).toEqual([
      `${P} SITE_URL=https://app.example.com pnpm build`,
      `${P} wrangler d1 migrations apply DB --remote -c wrangler.jsonc`,
      `${P} wrangler deploy --message production abc1234`,
    ])
    expect(calls.indexOf(bookmark)).toBeLessThan(
      calls.indexOf(`${P} wrangler d1 migrations apply DB --remote -c wrangler.jsonc`),
    )
    expect(calls).toContain('BASE_URL=https://app-x.ann.workers.dev pnpm test:coming-soon')
    expect(output()).toContain('restore point: bm-42')
    expect(output()).toContain('Coming soon). Smoke test passed.')
  })

  it('checks the app itself once LAUNCHED is "true"', async () => {
    const files = {
      'wrangler.jsonc': withVars('production', '"LAUNCHED": "true", "SITE_PROTECTION": "none"'),
    }
    const { calls } = await attempt(freshPlace({ files }), production(CONFIRM))
    expect(calls).toContain('BASE_URL=https://app-x.ann.workers.dev pnpm test:deployed')
  })

  it('refuses to migrate without a bookmark', async () => {
    const { code, calls, stopped } = await attempt(
      freshPlace({ failing: 'time-travel info' }),
      production(CONFIRM),
    )
    expect(code).toBe(1)
    expect(stopped).toContain('take a D1 Time Travel bookmark')
    expect(changes(calls)).toEqual([`${P} pnpm build`])
  })

  it('rolls back the code on a failed smoke test and prints the restore command, never running it', async () => {
    const { code, calls, stopped } = await attempt(freshPlace({ smokePasses: false }), production(CONFIRM))
    expect(code).toBe(1)
    expect(changes(calls).at(-1)).toBe(`${P} wrangler rollback --yes --message smoke failed on abc1234`)
    expect(stopped).toContain(
      'pnpm exec wrangler d1 time-travel restore DB --bookmark=bm-42 --env production -c wrangler.jsonc',
    )
    expect(calls.join('\n')).not.toContain('time-travel restore')
  })

  it('with Access in front of all of production, takes only PRODUCTION_ values, never the test ones', async () => {
    const vars = '"LAUNCHED": "false", "SITE_PROTECTION": "access", "ACCESS_PATHS": "/*"'
    const files = { 'wrangler.jsonc': withVars('production', vars) }
    const test = { CF_ACCESS_CLIENT_ID: 't', CF_ACCESS_CLIENT_SECRET: 't', TEST_CF_ACCESS_CLIENT_ID: 't' }
    const refused = await attempt(freshPlace({ files: { ...files }, local: test }), production(CONFIRM))
    expect(refused.stopped).toContain('PRODUCTION_CF_ACCESS_CLIENT_ID and PRODUCTION_CF_ACCESS_CLIENT_SECRET')
    expect(changes(refused.calls)).toEqual([])

    const local = { ...test, PRODUCTION_CF_ACCESS_CLIENT_ID: 'p', PRODUCTION_CF_ACCESS_CLIENT_SECRET: 'q' }
    const sent = await attempt(freshPlace({ files: { ...files }, local }), production(CONFIRM))
    expect(sent.calls).toContain(
      'BASE_URL=https://app-x.ann.workers.dev CF_ACCESS_CLIENT_ID=p CF_ACCESS_CLIENT_SECRET=q pnpm test:coming-soon',
    )
  })
})

// #139: setup-cloudflare never makes a secret it can't store. It checks .env.cloudflare.local can
// take it first, saves the password before the Worker gets it, and deletes a new service token
// again when its secret couldn't be saved, so no secret exists that nobody holds.
import { describe, expect, it } from 'vitest'

import { freshWorld, PACK_CONFIG, run, type World, zeroTrust } from './fakes'

const ACCESS = { CLOUDFLARE_ACCESS_TOKEN: 'set' }
const TOKEN_SECRET = 'cfast_SECRET' // what the fake Cloudflare API answers for a new service token
const PASSWORD = 'Zx81_random-SECRET-value-0123456' // the fakes' randomSecret()
const WHO = { allowEmails: ['ann@example.com'] }
const files = (): Record<string, string> => ({ 'wrangler.jsonc': PACK_CONFIG })
const withAccess = (more: Partial<World> = {}): World => ({ ...freshWorld(), access: zeroTrust(), ...more })

type Result = Awaited<ReturnType<typeof run>>
const tokenWrites = (r: Result) =>
  r.writes.filter((w) => w.path.includes('/access/service_tokens')).map((w) => `${w.method} ${w.path}`)
/** Everything the run showed or sent anywhere but the local file. */
const shown = (r: Result) => [r.output(), r.calls.join('\n'), JSON.stringify(r.writes), r.stdin.join('\n')]

describe.each(['false', 'throw'] as const)('when saving to .env.cloudflare.local fails (%s)', (how) => {
  it('deletes the new service token, makes no Access app, prints no secret, and exits non-zero', async () => {
    const world = withAccess({ saveFails: how })
    const r = await run(world, files(), { protect: 'access', ci: 'actions', ...WHO }, ACCESS)
    expect(r.code).not.toBe(0)
    expect(tokenWrites(r)).toEqual([
      'POST /accounts/acc_1/access/service_tokens',
      'DELETE /accounts/acc_1/access/service_tokens/tok_1',
    ])
    expect(world.access!.tokens).toEqual([])
    expect(r.writes.some((w) => w.path.includes('/access/apps'))).toBe(false)
    expect(r.calls.some((c) => c.startsWith('gh secret set CF_ACCESS_CLIENT'))).toBe(false)
    expect(r.output()).toContain('so the new service token "app-test CI" was deleted in Cloudflare')
    expect(r.output()).toContain('then run this again')
    expect(r.output()).not.toContain('by hand')
    for (const text of shown(r)) expect(text).not.toContain(TOKEN_SECRET)
  })

  it('sets no password on the test Worker, prints none, and exits non-zero', async () => {
    const world = { ...freshWorld(), saveFails: how }
    const r = await run(world, files(), { protect: 'password' })
    expect(r.code).not.toBe(0)
    expect(r.calls.some((c) => c.includes('secret put'))).toBe(false)
    expect(world.testSecrets).toEqual([])
    expect(r.output()).toContain('so no password was set')
    expect(r.output()).not.toContain('by hand')
    for (const text of shown(r)) expect(text).not.toContain(PASSWORD)
  })
})

describe('before making a token or a password', () => {
  it('says to delete the token in Zero Trust when deleting it fails too', async () => {
    const world = withAccess({ saveFails: 'throw', tokenDeleteFails: true })
    const r = await run(world, files(), { protect: 'access', ...WHO }, ACCESS)
    expect(r.code).not.toBe(0)
    expect(r.output()).toContain('Delete "app-test CI" in Zero Trust → Service credentials')
    for (const text of shown(r)) expect(text).not.toContain(TOKEN_SECRET)
  })

  it('makes neither when .env.cloudflare.local can’t be written', async () => {
    const world = withAccess({ localUnwritable: true })
    const access = await run(world, files(), { protect: 'access', ...WHO }, ACCESS)
    expect(tokenWrites(access)).toEqual([])
    expect(access.output()).toContain("can't be written")
    const password = await run(world, files(), { protect: 'password' })
    expect(password.calls.some((c) => c.includes('secret put'))).toBe(false)
    expect(password.output()).toContain("can't be written")
  })

  it('a dry run checks the file too, so it never promises what the real run refuses', async () => {
    const world = withAccess({ localNotIgnored: true })
    const access = await run(world, files(), { protect: 'access', dryRun: true, ...WHO }, ACCESS)
    expect(access.output()).toContain("isn't git-ignored")
    expect(access.output()).not.toContain('would create service token')
    const password = await run(world, files(), { protect: 'password', dryRun: true })
    expect(password.output()).toContain("isn't git-ignored")
    expect(password.output()).not.toContain('would make a random SITE_PASSWORD')
  })

  it('an existing token gets the refresh hint only when the file lacks its two values', async () => {
    const token = { id: 'tok_9', name: 'app-test CI' }
    const names = ['TEST_CF_ACCESS_CLIENT_ID', 'TEST_CF_ACCESS_CLIENT_SECRET']
    const opts = { protect: 'access' as const, ...WHO }
    const lacking = withAccess()
    lacking.access!.tokens.push(token)
    const missing = await run(lacking, files(), opts, ACCESS)
    expect(missing.output()).toContain('refresh the token in Zero Trust')
    const holding = withAccess({ localNames: names })
    holding.access!.tokens.push(token)
    const held = await run(holding, files(), opts, ACCESS)
    expect(held.output()).toContain('exists  service token "app-test CI"')
    expect(held.output()).not.toContain('refresh the token')
  })
})

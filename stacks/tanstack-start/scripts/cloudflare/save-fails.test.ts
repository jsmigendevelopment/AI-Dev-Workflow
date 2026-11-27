// #139: setup-cloudflare never makes a secret it can't store. It checks .env.cloudflare.local can
// take it first, saves the password before the Worker gets it, and deletes a new service token
// again when its secret couldn't be saved, so no secret exists that nobody holds.
import { describe, expect, it } from 'vitest'

import { freshWorld, PACK_CONFIG, run, type World, zeroTrust } from './fakes'
import { readResources } from './wrangler-config'

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

// #160: the new password is saved before the Worker gets it, so a failed put leaves the two apart.
// After a failed put nobody knows what the Worker holds; the next --new-password always converges.
describe('when wrangler secret put SITE_PASSWORD fails', () => {
  it('AC-160-3: WHEN --new-password runs and wrangler secret put fails THEN it says plainly to rerun with --new-password, exits non-zero and prints no password', async () => {
    const world: World = {
      ...freshWorld(),
      testSecrets: ['SITE_PASSWORD'],
      localNames: ['TEST_SITE_PASSWORD'],
      passwordPutFails: true,
    }
    const config = files()
    const r = await run(world, config, { protect: 'password', newPassword: true })
    expect(r.code).not.toBe(0)
    expect(r.saved).toEqual({ TEST_SITE_PASSWORD: PASSWORD }) // kept: the Worker may have taken it
    expect(r.output()).toContain(
      'TEST_SITE_PASSWORD in .env.cloudflare.local is now a new password the test Worker may not have. Run this again with --protect password --new-password so the two match.',
    )
    expect(r.output()).not.toContain('Done.')
    expect(readResources(config['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('none')
    // Sent only on the put's stdin; the fake's error echoes it, and the stop message hides it.
    expect(r.stdin).toEqual([PASSWORD])
    expect(r.output()).toContain('<hidden>')
    for (const text of [r.output(), r.calls.join('\n'), JSON.stringify(r.writes)])
      expect(text).not.toContain(PASSWORD)
  })

  it('AC-160-3: WHEN the rerun with --new-password succeeds THEN the Worker and the file match again', async () => {
    const world: World = { ...freshWorld(), testSecrets: ['SITE_PASSWORD'], passwordPutFails: true, secretsMade: 0 }
    const first = await run(world, files(), { protect: 'password', newPassword: true })
    world.passwordPutFails = false
    const again = await run(world, files(), { protect: 'password', newPassword: true })
    expect(again.code).toBe(0)
    expect(again.calls).toContain('wrangler secret put SITE_PASSWORD --env test <stdin>')
    expect(again.saved.TEST_SITE_PASSWORD).not.toBe(first.saved.TEST_SITE_PASSWORD) // the fake varies it
    expect(again.stdin).toEqual([again.saved.TEST_SITE_PASSWORD])
    expect(again.output()).toContain('set SITE_PASSWORD on the test Worker')
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

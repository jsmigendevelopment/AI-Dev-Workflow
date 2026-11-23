import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { ACCESS_JWT_HEADER, accessCheck, type AccessConfig, accessPaths } from './access-jwt'

const TEAM = 'https://ann.cloudflareaccess.com'
const AUD = 'a'.repeat(64)
const ORIGIN = 'https://app-test.ann.workers.dev'
const ALL: AccessConfig = { teamDomain: TEAM, aud: AUD, paths: ['/*'] }

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let teamKey: Key
let otherKey: Key
let keys: JWTVerifyGetKey

beforeAll(async () => {
  const team = await generateKeyPair('RS256')
  teamKey = team.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(team.publicKey)), kid: 'k1', alg: 'RS256' }] })
})

function token(claims: { aud?: string; iss?: string; exp?: string | number } = {}, key = teamKey) {
  return new SignJWT({ email: 'ann@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(claims.iss ?? TEAM)
    .setAudience(claims.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5m')
    .sign(key)
}

async function check(path: string, jwt?: string, config = ALL, open: readonly string[] = []) {
  const url = new URL(path, ORIGIN)
  const headers: Record<string, string> = jwt === undefined ? {} : { [ACCESS_JWT_HEADER]: jwt }
  const refusals: string[] = []
  const response = await accessCheck(
    new Request(url, { headers }),
    url,
    config,
    keys,
    (why) => refusals.push(why),
    open,
  )
  return { response, refusals }
}

async function expect401(result: { response: Response | null }) {
  expect(result.response?.status).toBe(401)
  expect(result.response?.headers.get('www-authenticate')).toBe('Cloudflare-Access realm="site"')
  expect(result.response?.headers.get('cache-control')).toBe('no-store')
  expect(await result.response?.json()).toEqual({
    ok: false,
    error: { code: 'unauthenticated', message: 'Sign in through Cloudflare Access to continue.' },
  })
}

describe('the Cloudflare Access JWT check', () => {
  it('lets a valid token through', async () => {
    const { response, refusals } = await check('/notes', await token())
    expect(response).toBeNull()
    expect(refusals).toEqual([])
  })

  it('refuses a missing header with the 401 envelope', async () => {
    const result = await check('/notes')
    await expect401(result)
    expect(result.refusals).toEqual(['missing'])
  })

  it('refuses a token for another Access app (wrong audience)', async () => {
    const result = await check('/notes', await token({ aud: 'b'.repeat(64) }))
    await expect401(result)
    expect(result.refusals).toEqual(['invalid'])
  })

  it('refuses a token from another team (wrong issuer)', async () => {
    await expect401(await check('/', await token({ iss: 'https://mallory.cloudflareaccess.com' })))
  })

  it('refuses an expired token', async () => {
    await expect401(await check('/', await token({ exp: Math.floor(Date.now() / 1000) - 120 })))
  })

  it('refuses a bad signature (signed with a key that is not the team’s)', async () => {
    await expect401(await check('/', await token({}, otherKey)))
    const [h, p] = (await token()).split('.')
    await expect401(await check('/', `${h}.${p}.c2lnbmF0dXJl`))
  })

  it('refuses junk and an unsigned token', async () => {
    await expect401(await check('/', 'not-a-jwt'))
    const [, p] = (await token()).split('.')
    const none = btoa(JSON.stringify({ alg: 'none' })).replace(/=+$/, '')
    await expect401(await check('/', `${none}.${p}.`))
  })

  it('leaves unprotected paths and OPEN_PATHS alone', async () => {
    const admin: AccessConfig = { ...ALL, paths: accessPaths('/admin/*, /ops') }
    expect(admin.paths).toEqual(['/admin/*', '/ops'])
    expect((await check('/', undefined, admin)).response).toBeNull()
    expect((await check('/notes', undefined, admin)).response).toBeNull()
    expect((await check('/administrator', undefined, admin)).response).toBeNull()
    await expect401(await check('/admin/users', undefined, admin))
    await expect401(await check('/ops', undefined, admin))
    expect((await check('/api/stripe/webhook', undefined, ALL, ['/api/stripe/*'])).response).toBeNull()
  })

  it('protects every path when ACCESS_PATHS is unset', () => {
    expect(accessPaths(undefined)).toEqual(['/*'])
    expect(accessPaths('')).toEqual(['/*'])
  })
})

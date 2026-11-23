import { describe, expect, it } from 'vitest'

import {
  authorizedParties,
  type BuildTarget,
  isNativeBearer,
  NO_PARTY,
  partiesConfigError,
} from './authorized-parties'

const local: BuildTarget = { deployEnv: 'local', testWorker: '', siteUrl: '' }
const test: BuildTarget = { deployEnv: 'test', testWorker: 'app-test', siteUrl: '' }
const production: BuildTarget = {
  deployEnv: 'production',
  testWorker: '',
  siteUrl: 'https://app.example.com',
}

const partiesFor = (url: string, target: BuildTarget, extra?: string) =>
  authorizedParties(new URL(url), target, extra)

describe('authorizedParties: the origins a Clerk session token (azp) may come from', () => {
  it('local: the loopback origin the request came to, port included', () => {
    expect(partiesFor('http://localhost:4173/api/v1/notes', local)).toEqual(['http://localhost:4173'])
    expect(partiesFor('http://127.0.0.1:3000/', local)).toEqual(['http://127.0.0.1:3000'])
    expect(partiesFor('http://[::1]:3000/', local)).toEqual(['http://[::1]:3000'])
  })

  it('local: a request to a non-loopback host gets no own-origin party (fails closed)', () => {
    expect(partiesFor('http://192.168.1.20:3000/', local)).toEqual([NO_PARTY])
    expect(partiesFor('http://localhost.evil.example:3000/', local)).toEqual([NO_PARTY])
  })

  it('production: SITE_URL as an origin, never the request origin', () => {
    expect(partiesFor('https://app.example.com/notes', production)).toEqual(['https://app.example.com'])
    expect(partiesFor('https://app-production.acme.workers.dev/', production)).toEqual([
      'https://app.example.com',
    ])
    expect(partiesFor('http://localhost:4173/', production)).toEqual(['https://app.example.com'])
    const withPath = { ...production, siteUrl: 'https://example.com/app' }
    expect(partiesFor('https://example.com/app', withPath)).toEqual(['https://example.com'])
  })

  it('every environment: CLERK_AUTHORIZED_PARTIES adds exact origins', () => {
    expect(
      partiesFor(
        'https://app.example.com/',
        production,
        'https://www.example.com, https://admin.example.com',
      ),
    ).toEqual(['https://app.example.com', 'https://www.example.com', 'https://admin.example.com'])
    expect(partiesFor('https://test.example.com/', test, 'https://test.example.com')).toEqual([
      'https://test.example.com',
    ])
  })

  it('test: a preview origin passes only when it is the request’s own and matches the test Worker', () => {
    expect(partiesFor('https://pr-12-app-test.acme.workers.dev/notes', test)).toEqual([
      'https://pr-12-app-test.acme.workers.dev',
    ])
    expect(partiesFor('https://app-test.acme.workers.dev/', test)).toEqual([
      'https://app-test.acme.workers.dev',
    ])
  })

  it('test: look-alike hosts never become a party', () => {
    for (const url of [
      'https://pr-12-app-test.acme.workers.dev.evil.com/',
      'https://pr-12-app-tester.acme.workers.dev/',
      'https://pr-12-other-app-test.acme.workers.dev/',
      'https://evil-pr-12-app-test.acme.workers.dev/',
      'https://pr-12-app-test.a.b.workers.dev/',
      'https://pr-x-app-test.acme.workers.dev/',
      'https://pr-12-app-test.acme.workers.dev:8443/',
      'http://pr-12-app-test.acme.workers.dev/',
      'https://pr-12-app-testXacme.workers.dev/',
      'http://localhost:4173/',
    ])
      expect(partiesFor(url, test), url).toEqual([NO_PARTY])
  })

  it('test: without the test Worker name there is no preview rule', () => {
    expect(partiesFor('https://pr-1-app-test.acme.workers.dev/', { ...test, testWorker: '' })).toEqual([
      NO_PARTY,
    ])
  })

  it('never returns an empty list: Clerk skips the azp check entirely on an empty list', () => {
    expect(partiesFor('https://pr-1-app-test.acme.workers.dev/', production)).not.toContain(
      'https://pr-1-app-test.acme.workers.dev',
    )
    const none = { ...production, siteUrl: '' }
    expect(partiesFor('https://app.example.com/', none)).toEqual([NO_PARTY])
    expect(() => new URL(NO_PARTY).origin).not.toThrow()
    expect(new URL(NO_PARTY).origin).toBe('null')
  })

  it('drops duplicates', () => {
    expect(partiesFor('https://app.example.com/', production, 'https://app.example.com')).toEqual([
      'https://app.example.com',
    ])
  })
})

describe('partiesConfigError: fails closed at startup when production has no origin', () => {
  const keys = { CLERK_SECRET_KEY: 'sk_test_x', CLERK_PUBLISHABLE_KEY: 'pk_test_x' }

  it('production with Clerk keys needs SITE_URL or CLERK_AUTHORIZED_PARTIES', () => {
    const none = { ...production, siteUrl: '' }
    expect(partiesConfigError(keys, none)).toMatch(/CLERK_AUTHORIZED_PARTIES is missing/)
    expect(partiesConfigError(keys, none)).toMatch(/SITE_URL/)
    expect(partiesConfigError(keys, production)).toBeNull()
    expect(partiesConfigError({ ...keys, CLERK_AUTHORIZED_PARTIES: 'https://a.example' }, none)).toBeNull()
  })

  it('live keys anywhere need a fixed origin too; no keys, nothing to check', () => {
    const live = { CLERK_SECRET_KEY: 'sk_live_DO_NOT_PRINT', CLERK_PUBLISHABLE_KEY: 'pk_live_x' }
    expect(partiesConfigError(live, test)).toMatch(/CLERK_AUTHORIZED_PARTIES is missing/)
    expect(partiesConfigError(live, test)).not.toContain('DO_NOT_PRINT')
    expect(partiesConfigError(keys, test)).toBeNull()
    expect(partiesConfigError(keys, local)).toBeNull()
    expect(partiesConfigError({}, { ...production, siteUrl: '' })).toBeNull()
  })
})

describe('isNativeBearer: a native app’s token (no Origin, so no azp), only where opted in', () => {
  const jwt = (claims: Record<string, unknown>) =>
    ['eyJhbGciOiJSUzI1NiJ9', btoa(JSON.stringify(claims)).replace(/=+$/, ''), 'c2ln'].join('.')
  const call = (path: string, headers: Record<string, string>) =>
    new Request(`https://app.example.com${path}`, { headers })
  const bearer = (claims: Record<string, unknown>, path = '/api/v1/notes') =>
    call(path, { authorization: `Bearer ${jwt(claims)}` })

  it('a bearer token with no azp on /api/v1, with CLERK_ALLOW_NATIVE_TOKENS on', () => {
    expect(isNativeBearer(bearer({ sub: 'user_1' }), true)).toBe(true)
    expect(isNativeBearer(bearer({ sub: 'user_1' }, '/api/v1'), true)).toBe(true)
  })

  it('never with the opt-in off', () => {
    expect(isNativeBearer(bearer({ sub: 'user_1' }), false)).toBe(false)
  })

  it('never for a token that names an origin, even a wrong one, or an empty azp', () => {
    expect(isNativeBearer(bearer({ sub: 'user_1', azp: 'https://evil.example' }), true)).toBe(false)
    expect(isNativeBearer(bearer({ sub: 'user_1', azp: '' }), true)).toBe(false)
  })

  it('never for the cookie, outside /api/v1, or a token it cannot read', () => {
    const cookie = `__session=${jwt({ sub: 'user_1' })}; __client_uat=1`
    expect(isNativeBearer(call('/api/v1/notes', { cookie }), true)).toBe(false)
    expect(isNativeBearer(bearer({ sub: 'user_1' }, '/notes'), true)).toBe(false)
    expect(isNativeBearer(bearer({ sub: 'user_1' }, '/_serverFn/x'), true)).toBe(false)
    expect(isNativeBearer(bearer({ sub: 'user_1' }, '/api/v10'), true)).toBe(false)
    for (const authorization of ['Bearer not-a-jwt', 'Bearer a.%%%.c', 'Bearer a.bnVsbA.c', 'Basic dXNlcg=='])
      expect(isNativeBearer(call('/api/v1/notes', { authorization }), true), authorization).toBe(false)
  })
})

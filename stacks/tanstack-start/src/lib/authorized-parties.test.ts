import { describe, expect, it } from 'vitest'

import {
  authorizedParties,
  type BuildTarget,
  isApiRedirect,
  isNativeBearer,
  nativeClaimMissing,
  NO_PARTY,
  partiesConfigError,
  requestForClerk,
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
  const keys = { CLERK_SECRET_KEY: 'sk_test_x', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' }

  it('production with Clerk keys needs SITE_URL or CLERK_AUTHORIZED_PARTIES', () => {
    const none = { ...production, siteUrl: '' }
    expect(partiesConfigError(keys, none)).toMatch(/CLERK_AUTHORIZED_PARTIES is missing/)
    expect(partiesConfigError(keys, none)).toMatch(/SITE_URL/)
    expect(partiesConfigError(keys, production)).toBeNull()
    expect(partiesConfigError({ ...keys, CLERK_AUTHORIZED_PARTIES: 'https://a.example' }, none)).toBeNull()
  })

  it('live keys anywhere need a fixed origin too; no keys, nothing to check', () => {
    const live = { CLERK_SECRET_KEY: 'sk_live_DO_NOT_PRINT', VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x' }
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
  const native = { sub: 'user_1', app: 'my-app' }
  const bearer = (claims: Record<string, unknown>, path = '/api/v1/notes') =>
    call(path, { authorization: `Bearer ${jwt(claims)}` })
  const on = { CLERK_ALLOW_NATIVE_TOKENS: 'true', CLERK_NATIVE_APP_CLAIM: 'my-app' }

  it('a bearer token with no azp and our app claim on /api/v1, with native tokens on', () => {
    expect(isNativeBearer(bearer(native), on)).toBe(true)
    expect(isNativeBearer(bearer(native, '/api/v1'), on)).toBe(true)
  })

  it('never without the app claim, with a wrong one, or with one that is not a string', () => {
    expect(isNativeBearer(bearer({ sub: 'user_1' }), on)).toBe(false)
    for (const app of ['other-app', 'MY-APP', 'my-app ', '', null, 1, true, ['my-app'], { app: 'my-app' }])
      expect(isNativeBearer(bearer({ sub: 'user_1', app }), on), JSON.stringify(app)).toBe(false)
  })

  it('never with the opt-in off, or on with no claim value to check (fails closed)', () => {
    expect(isNativeBearer(bearer(native), { CLERK_NATIVE_APP_CLAIM: 'my-app' })).toBe(false)
    expect(isNativeBearer(bearer(native), { ...on, CLERK_ALLOW_NATIVE_TOKENS: 'false' })).toBe(false)
    expect(isNativeBearer(bearer(native), { CLERK_ALLOW_NATIVE_TOKENS: 'true' })).toBe(false)
    expect(isNativeBearer(bearer({ sub: 'user_1', app: '' }), { ...on, CLERK_NATIVE_APP_CLAIM: '' })).toBe(
      false,
    )
  })

  it('nativeClaimMissing: only native tokens on with no claim value', () => {
    expect(nativeClaimMissing({ CLERK_ALLOW_NATIVE_TOKENS: 'true' })).toBe(true)
    expect(nativeClaimMissing(on)).toBe(false)
    expect(nativeClaimMissing({})).toBe(false)
  })

  it('never for a token that names an origin, even a wrong one, or an empty azp', () => {
    expect(isNativeBearer(bearer({ ...native, azp: 'https://evil.example' }), on)).toBe(false)
    expect(isNativeBearer(bearer({ ...native, azp: '' }), on)).toBe(false)
  })

  it('never with a lowercase or otherwise inexact scheme (Clerk would read the cookie)', () => {
    for (const scheme of ['bearer', 'BEARER', 'Bearer '])
      expect(
        isNativeBearer(call('/api/v1/notes', { authorization: `${scheme} ${jwt(native)}` }), on),
        scheme,
      ).toBe(false)
  })

  it('never while any Clerk session cookie is there, suffixed ones included', () => {
    const authorization = `Bearer ${jwt(native)}`
    for (const cookie of ['__session=x', '__client_uat=1', 'a=1; __session_Abc12=x', '__client_uat_Abc12=0'])
      expect(isNativeBearer(call('/api/v1/notes', { authorization, cookie }), on), cookie).toBe(false)
    expect(isNativeBearer(call('/api/v1/notes', { authorization, cookie: 'theme=dark' }), on)).toBe(true)
  })

  it('never for the cookie, outside /api/v1, or a token it cannot read', () => {
    const cookie = `__session=${jwt(native)}; __client_uat=1`
    expect(isNativeBearer(call('/api/v1/notes', { cookie }), on)).toBe(false)
    expect(isNativeBearer(bearer(native, '/notes'), on)).toBe(false)
    expect(isNativeBearer(bearer(native, '/_serverFn/x'), on)).toBe(false)
    expect(isNativeBearer(bearer(native, '/api/v10'), on)).toBe(false)
    for (const authorization of ['Bearer not-a-jwt', 'Bearer a.%%%.c', 'Bearer a.bnVsbA.c', 'Basic dXNlcg=='])
      expect(isNativeBearer(call('/api/v1/notes', { authorization }), on), authorization).toBe(false)
  })
})

describe('requestForClerk: on /api/v1 Clerk never sees the cookie', () => {
  const headers = { cookie: '__session=x; __client_uat=1', authorization: 'Bearer abc', 'x-test': '1' }

  it('drops Cookie on /api/v1 and keeps the URL, method and every other header', () => {
    const original = new Request('https://app.example.com/api/v1/notes?limit=5', {
      method: 'POST',
      headers,
      body: '{"title":"Hi"}',
    })
    const forClerk = requestForClerk(original)
    expect(forClerk.headers.get('cookie')).toBeNull()
    expect(forClerk.url).toBe(original.url)
    expect(forClerk.method).toBe('POST')
    expect(forClerk.headers.get('authorization')).toBe('Bearer abc')
    expect(forClerk.headers.get('x-test')).toBe('1')
    expect(original.bodyUsed).toBe(false)
    expect(original.headers.get('cookie')).toBe(headers.cookie)
  })

  it('drops every __clerk query parameter on /api/v1 and keeps the rest of the query', () => {
    const clerk = [
      '__clerk_handshake=junk',
      '__clerk_handshake_nonce=n',
      '__clerk_redirect_url=https%3A%2F%2Fevil.example',
      '__clerk_db_jwt=dvb_x',
      '__clerk_synced=false',
      '__clerk_help=1',
      '__CLERK_status=x',
      '__clerk_synced=true',
    ]
    const request = new Request(`https://app.example.com/api/v1/notes?limit=5&${clerk.join('&')}&q=a+b`)
    expect(requestForClerk(request).url).toBe('https://app.example.com/api/v1/notes?limit=5&q=a+b')
    const plain = new Request('https://app.example.com/api/v1/notes?limit=5&q=%20x&clerk=1&_clerk=2')
    expect(requestForClerk(plain).url).toBe(plain.url)
    const page = new Request('https://app.example.com/notes?__clerk_handshake=junk')
    expect(requestForClerk(page)).toBe(page)
  })

  it('isApiRedirect: any 3xx from Clerk on /api/v1, never a page or another status', () => {
    const api = new Request('https://app.example.com/api/v1/notes')
    for (const status of [301, 302, 303, 307, 308])
      expect(isApiRedirect(api, new Response(null, { status })), String(status)).toBe(true)
    for (const status of [200, 401, 404, 500])
      expect(isApiRedirect(api, new Response(null, { status })), String(status)).toBe(false)
    expect(
      isApiRedirect(new Request('https://app.example.com/notes'), new Response(null, { status: 307 })),
    ).toBe(false)
  })

  it('leaves pages and server functions alone: the cookie is how they sign in', () => {
    for (const path of ['/', '/notes', '/_serverFn/x', '/api/v10']) {
      const request = new Request(`https://app.example.com${path}`, { headers })
      expect(requestForClerk(request), path).toBe(request)
    }
  })
})

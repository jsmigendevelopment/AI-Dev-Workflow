import { describe, expect, it } from 'vitest'
import { isOpenPath, OPEN_PATHS } from './open-paths'
import {
  constantTimeEqual,
  GATE_COOKIE,
  GATE_HEADER,
  GATE_PATH,
  gateToken,
  passwordMatches,
  safeNext,
  siteGate,
} from './site-gate'

const PASSWORD = 'k3Vq9XbT0wLr7NpZs2YhAe5D'
const ORIGIN = 'https://pr-12-app-test.example.workers.dev'

const allowAll = () => Promise.resolve(true)

function call(
  path: string,
  init: RequestInit = {},
  handlerType: 'router' | 'serverFn' = 'router',
  limiter = allowAll,
) {
  const url = new URL(path, ORIGIN)
  return siteGate(new Request(url, init), url, handlerType, PASSWORD, limiter)
}

function login(password: string, next = '/notes', headers: Record<string, string> = {}) {
  const body = new URLSearchParams({ password, next }).toString()
  return call(GATE_PATH, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': String(body.length),
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  })
}

describe('the password gate', () => {
  it('shows the password page for any page without the cookie: 401, noindex, no script', async () => {
    const response = (await call('/notes?tab=2'))!
    expect(response.status).toBe(401)
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const html = await response.text()
    expect(html).toContain('<h1>Password needed</h1>')
    expect(html).toContain('<label for="password">Password</label>')
    expect(html).toContain(`action="${GATE_PATH}"`)
    expect(html).toContain('name="next" value="/notes?tab=2"')
    expect(html).not.toMatch(/<script\b/i)
  })

  it('refuses server functions, /api/v1 and writes with the forbidden envelope', async () => {
    for (const response of [
      await call('/_serverFn/abc', { method: 'POST' }, 'serverFn'),
      await call('/api/v1/notes'),
      await call('/', { method: 'DELETE' }),
    ]) {
      expect(response!.status).toBe(403)
      expect(await response!.json()).toEqual({
        ok: false,
        error: { code: 'forbidden', message: 'This test site needs its password.' },
      })
    }
  })

  it('lets CI through with the x-site-password header, never Authorization', async () => {
    expect(GATE_HEADER).toBe('x-site-password')
    expect(await call('/', { headers: { [GATE_HEADER]: PASSWORD } })).toBeNull()
    expect(await call('/api/v1/notes', { headers: { [GATE_HEADER]: PASSWORD } })).toBeNull()
    expect(await call('/', { headers: { authorization: `Bearer ${PASSWORD}` } })).not.toBeNull()
    expect(await call('/', { headers: { [GATE_HEADER]: 'wrong' } })).not.toBeNull()
  })

  it('sets an HttpOnly, Secure, SameSite=Lax cookie that never holds the password', async () => {
    const response = (await login(PASSWORD))!
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/notes')
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(new RegExp(`^${GATE_COOKIE}=[\\w-]+; Path=/; Secure; HttpOnly; SameSite=Lax$`))
    expect(cookie).not.toContain(PASSWORD)
    const value = cookie.split(';')[0]!.split('=')[1]!
    expect(await call('/notes', { headers: { cookie: `a=b; ${GATE_COOKIE}=${value}` } })).toBeNull()
    expect(await call('/notes', { headers: { cookie: `${GATE_COOKIE}=${value}x` } })).not.toBeNull()
    expect(await gateToken('another-password-entirely')).not.toBe(value)
  })

  it('answers a wrong password with the page, the error announced and tied to the field', async () => {
    const response = (await login('not-it'))!
    expect(response.status).toBe(401)
    const html = await response.text()
    expect(html).toContain('role="alert">That password is not right.</p>')
    expect(html).toContain('aria-invalid="true" aria-describedby="password-error"')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('rate-limits wrong answers, by form and by header', async () => {
    let left = 2
    const limiter = () => Promise.resolve(left-- > 0)
    const wrong = () => {
      const body = 'password=nope&next=%2F'
      return call(
        GATE_PATH,
        {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': String(body.length),
            origin: ORIGIN,
          },
        },
        'router',
        limiter,
      )
    }
    expect((await wrong())!.status).toBe(401)
    expect((await wrong())!.status).toBe(401)
    const blocked = (await wrong())!
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('60')
    const header = (await call('/', { headers: { [GATE_HEADER]: 'nope' } }, 'router', limiter))!
    expect(header.status).toBe(429)
    expect(((await header.json()) as { error: { code: string } }).error.code).toBe('rate_limited')
  })

  it('refuses a login posted from another site', async () => {
    const response = (await login(PASSWORD, '/', { origin: 'https://evil.example' }))!
    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('never redirects off the site after a login', async () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'notes', GATE_PATH])
      expect(safeNext(next), next).toBe('/')
    expect(safeNext('/notes?x=1')).toBe('/notes?x=1')
    expect((await login(PASSWORD, '//evil.example'))!.headers.get('location')).toBe('/')
  })

  it('compares in constant time over the whole value', async () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
    expect(await passwordMatches(PASSWORD, PASSWORD)).toBe(true)
    expect(await passwordMatches(`${PASSWORD}x`, PASSWORD)).toBe(false)
    expect(await passwordMatches(null, PASSWORD)).toBe(false)
  })

  it('keeps only the listed paths open, and ships with none', async () => {
    expect(OPEN_PATHS).toEqual([])
    expect(isOpenPath('/api/stripe/webhook', ['/api/stripe/webhook'])).toBe(true)
    expect(isOpenPath('/api/stripe/webhook/x', ['/api/stripe/webhook'])).toBe(false)
    expect(isOpenPath('/hooks/a', ['/hooks/*'])).toBe(true)
    const url = new URL('/api/stripe/webhook', ORIGIN)
    const open = await siteGate(new Request(url, { method: 'POST' }), url, 'router', PASSWORD, allowAll, [
      '/api/stripe/webhook',
    ])
    expect(open).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { rateLimitKey } from './rate-limit-key'
import { checkBody, isApiPath, MAX_BODY_BYTES, SCANNER_PATH } from './request-limits'

const post = (headers: Record<string, string>, body: BodyInit | null = 'x') =>
  new Request('https://app.example.com/_serverFn/x', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit)

describe('body limits', () => {
  it('lets reads and small bodies through', () => {
    expect(checkBody(new Request('https://app.example.com/'))).toBeNull()
    expect(checkBody(post({ 'content-length': '10' }))).toBeNull()
  })

  it('refuses a body over the cap before reading it', async () => {
    const request = post({ 'content-length': String(MAX_BODY_BYTES + 1) })
    const refused = checkBody(request)!
    expect(refused.status).toBe(413)
    expect(await refused.json()).toEqual({
      ok: false,
      error: { code: 'too_large', message: 'That request is too large.' },
    })
    expect(request.bodyUsed).toBe(false)
  })

  it('refuses a streamed body with no length (411) and a nonsense length (400)', () => {
    const stream = new ReadableStream({ start: (c) => c.close() })
    expect(checkBody(post({}, stream))!.status).toBe(411)
    expect(checkBody(post({ 'content-length': '-1' }))!.status).toBe(400)
  })
})

describe('api paths', () => {
  it('covers /api/v1 and nothing else', () => {
    for (const p of ['/api/v1', '/api/v1/notes', '/api/v1/notes/abc']) expect(isApiPath(p), p).toBe(true)
    for (const p of ['/api/v10/notes', '/api/files/x', '/api/v1x', '/notes', '/api/stripe/webhook'])
      expect(isApiPath(p), p).toBe(false)
  })
})

describe('scanner paths', () => {
  it('matches what scanners probe and nothing an app serves', () => {
    for (const p of ['/wp-login.php', '/.env', '/.git/config', '/phpinfo.php', '/xmlrpc.php', '/admin.aspx'])
      expect(SCANNER_PATH.test(p), p).toBe(true)
    for (const p of ['/', '/notes', '/robots.txt', '/assets/index-abc.js', '/.well-known/security.txt'])
      expect(SCANNER_PATH.test(p), p).toBe(false)
  })
})

describe('rate-limit keys', () => {
  it('keys IPv4 by address and IPv6 by /64', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7')
    expect(rateLimitKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
    expect(rateLimitKey('2001:0db8:0001:0002:ffff:0:0:9')).toBe('2001:db8:1:2::/64')
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(rateLimitKey(null)).toBe('unknown')
  })
})

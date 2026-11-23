import { describe, expect, it } from 'vitest'

import { rateLimitKey } from './rate-limit-key'
import { canonicalPath, checkBody, isApiPath, MAX_BODY_BYTES, SCANNER_PATH } from './request-limits'

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

describe('canonical paths', () => {
  // Start and the router resolve these to another path than the raw one the path guards compare.
  const SLASHES = ['/api//v1/notes', '//api/v1/notes', '/api/v1//notes']
  const LETTERS = [
    '/%61pi/v1/notes',
    '/%41PI/v1/notes',
    '/api/v%31/notes',
    '/api/v1/%6eotes',
    '/a%2Eb',
    '/a%7eb',
  ]
  const SERVER_FNS = ['/%5FserverFn/x', '/_server%46n/x', '/%5f%73erverFn/x']
  const SPACES = ['/notes%20', '/notes%20%20', '/notes%09', '/notes%0A', '/notes%0d', '/a%00b', '/a%7Fb']
  const KEPT = [
    '/',
    '/notes',
    '/api/v1/notes/',
    '/notes/a%20b',
    '/%20notes',
    '/notes/caf%C3%A9',
    '/api%2Fv1/notes',
    '/a%25b',
  ]

  it('refuses an empty segment and an escaped letter, digit or -._~', () => {
    for (const p of [...SLASHES, ...LETTERS]) expect(canonicalPath(p), p).toBeNull()
  })

  it('refuses an escaped server function base, so Start never sees one the guards miss', () => {
    for (const p of SERVER_FNS) expect(canonicalPath(p), p).toBeNull()
  })

  it('refuses an escaped control character anywhere, and a trailing escaped space', () => {
    for (const p of SPACES) expect(canonicalPath(p), p).toBeNull()
  })

  it('keeps every path a browser sends, inner spaces, encoded slashes and non-ASCII included', () => {
    for (const p of KEPT) expect(canonicalPath(p), p).toBe(p)
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

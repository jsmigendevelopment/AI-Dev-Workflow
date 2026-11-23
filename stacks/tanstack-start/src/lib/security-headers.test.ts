import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  botChallengeOrigin,
  clerkHostFromKey,
  createNonce,
  CSP_EXTRA,
  pageCsp,
  SECURITY_HEADERS,
} from './security-headers'

/** The header lines of one rule block in public/_headers. */
function headersBlock(rule: string): Record<string, string> {
  const lines = readFileSync('public/_headers', 'utf8').split('\n')
  const start = lines.indexOf(rule)
  const out: Record<string, string> = {}
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break
    const [name, ...value] = line.trim().split(': ')
    out[name!] = value.join(': ')
  }
  return out
}

/** The pack's policy before any add-on opens it (add-ons change CSP_EXTRA, not these tests). */
const NONE = { script: [], connect: [], img: [], frame: [] }

describe('security headers', () => {
  it('sends the same headers from _headers (static files) and the Worker', () => {
    expect(headersBlock('/*')).toEqual(SECURITY_HEADERS)
  })

  it('caches hashed assets for a year', () => {
    expect(headersBlock('/assets/*')).toEqual({ 'Cache-Control': 'public, max-age=31536000, immutable' })
  })

  it('never sets one header in two rules that match the same file', () => {
    const text = readFileSync('public/_headers', 'utf8')
    const rules = text.split('\n').filter((l) => l && !l.startsWith(' ') && !l.startsWith('#'))
    const cacheRules = rules.filter((r) => headersBlock(r)['Cache-Control'])
    expect(cacheRules.filter((r) => r.includes('*') && r !== '/assets/*')).toEqual([])
    expect(new Set(cacheRules).size).toBe(cacheRules.length)
  })

  it('allows scripts only from this origin or with the nonce', () => {
    const csp = pageCsp('abc123', {}, NONE)
    const script = csp.split('; ').find((d) => d.startsWith('script-src'))
    expect(script).toBe("script-src 'self' 'nonce-abc123'")
    // Only styles may be inline (React writes style attributes at runtime).
    expect(csp.split('; ').filter((d) => d.includes('unsafe'))).toEqual(["style-src 'self' 'unsafe-inline'"])
    expect(script).not.toContain('unsafe')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
  })

  it('opens third-party origins only for configured features', () => {
    expect(pageCsp('n', {}, NONE)).not.toContain('challenges.cloudflare.com')
    expect(pageCsp('n', { turnstile: true }, NONE)).toMatch(
      /script-src [^;]*https:\/\/challenges\.cloudflare\.com/,
    )
    expect(pageCsp('n', { turnstile: true }, NONE)).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/)
    const clerk = pageCsp('n', { clerkHost: 'clerk.example.com' }, NONE)
    expect(clerk).toMatch(/script-src [^;]*https:\/\/clerk\.example\.com/)
    expect(clerk).toMatch(/connect-src [^;]*https:\/\/clerk\.example\.com/)
  })

  it("opens Bot Fight Mode's same-origin paths for script and connect, on the production domain only", () => {
    const site = 'https://app.example.com'
    const fallback = 'http://localhost:3000'
    const origin = botChallengeOrigin(new URL('https://app.example.com/notes'), site, fallback)
    expect(origin).toBe(site)
    for (const other of [
      'https://app-production.example.workers.dev/',
      'https://pr-3-app-test.example.workers.dev/',
      'http://localhost:4173/',
    ])
      expect(botChallengeOrigin(new URL(other), site, fallback), other).toBeUndefined()
    expect(botChallengeOrigin(new URL('http://localhost:3000/'), fallback, fallback)).toBeUndefined()
    const csp = pageCsp('n', { botChallengeOrigin: origin }, NONE)
    expect(csp).toContain(
      "script-src 'self' 'nonce-n' https://app.example.com/cdn-cgi/challenge-platform/ https://app.example.com/cdn-cgi/bm/",
    )
    expect(csp).toContain(
      "connect-src 'self' https://app.example.com/cdn-cgi/challenge-platform/ https://app.example.com/cdn-cgi/bm/",
    )
    expect(pageCsp('n', {}, NONE)).not.toContain('cdn-cgi')
  })

  it('adds origins from CSP_EXTRA, and ships with none', () => {
    expect(CSP_EXTRA).toEqual({ script: [], connect: [], img: [], frame: [] })
    const csp = pageCsp('n', {}, { script: ['https://static.example'], connect: [], img: [], frame: [] })
    expect(csp).toContain("script-src 'self' 'nonce-n' https://static.example")
  })

  it('makes a fresh 128-bit nonce each time', () => {
    const a = createNonce()
    expect(atob(a)).toHaveLength(16)
    expect(createNonce()).not.toBe(a)
  })

  it("reads Clerk's Frontend API host from the publishable key", () => {
    expect(clerkHostFromKey(`pk_test_${btoa('clever-cat-12.clerk.accounts.dev$')}`)).toBe(
      'clever-cat-12.clerk.accounts.dev',
    )
    expect(clerkHostFromKey(`pk_live_${btoa('clerk.example.com$')}`)).toBe('clerk.example.com')
    expect(clerkHostFromKey(`pk_test_${btoa("evil.com'; script-src *$")}`)).toBeUndefined()
    expect(clerkHostFromKey(undefined)).toBeUndefined()
    expect(clerkHostFromKey('pk_test_%%%')).toBeUndefined()
  })
})

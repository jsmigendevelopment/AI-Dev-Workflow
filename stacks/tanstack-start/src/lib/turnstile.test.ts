import { describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from './turnstile'

const answer = (body: unknown, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }))
const base = {
  secret: 'real-secret-key-0123',
  token: 'tok',
  remoteIp: '203.0.113.7',
  expectedHost: 'app.example.com',
}

describe('verifyTurnstile', () => {
  it('passes a successful check for this host', async () => {
    const fetch = answer({ success: true, hostname: 'app.example.com' })
    expect(await verifyTurnstile({ ...base, fetch })).toBe('passed')
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(init.body)).toContain('response=tok')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails closed: no token, wrong host, failure, server error, network error', async () => {
    expect(await verifyTurnstile({ ...base, token: undefined, fetch: answer({ success: true }) })).toBe(
      'failed',
    )
    expect(
      await verifyTurnstile({ ...base, fetch: answer({ success: true, hostname: 'evil.example' }) }),
    ).toBe('failed')
    expect(await verifyTurnstile({ ...base, fetch: answer({ success: false }) })).toBe('failed')
    expect(await verifyTurnstile({ ...base, fetch: answer({}, false) })).toBe('failed')
    const broken = vi.fn(async () => Promise.reject(new Error('offline')))
    expect(await verifyTurnstile({ ...base, fetch: broken })).toBe('failed')
  })

  it("accepts Cloudflare's example.com answer only with a test secret", async () => {
    const fetch = answer({ success: true, hostname: 'example.com' })
    expect(await verifyTurnstile({ ...base, fetch })).toBe('failed')
    expect(await verifyTurnstile({ ...base, secret: '1x0000000000000000000000000000000AA', fetch })).toBe(
      'passed',
    )
  })
})

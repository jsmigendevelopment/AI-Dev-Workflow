import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/app-error'
import { billingWebhook, MAX_WEBHOOK_BYTES } from './billing.http'
import type { BillingService } from './billing.service'

const post = (body: BodyInit | null, headers: Record<string, string> = { 'stripe-signature': 't=1,v1=x' }) =>
  new Request('https://app.example.com/api/stripe/webhook', { method: 'POST', body, headers })

const withWebhook = (webhook: BillingService['webhook']) => billingWebhook({ webhook } as BillingService)

describe('stripe webhook route', () => {
  it('answers 400 without a signature and never reads the body', async () => {
    const webhook = vi.fn()
    const request = post('{}', {})
    const response = await withWebhook(webhook)(request)
    expect(response.status).toBe(400)
    expect(request.bodyUsed).toBe(false)
    expect(webhook).not.toHaveBeenCalled()
  })

  it('answers 413 for a declared or actual body over the cap', async () => {
    const webhook = vi.fn()
    const big = 'x'.repeat(MAX_WEBHOOK_BYTES + 1)
    expect((await withWebhook(webhook)(post(big))).status).toBe(413)
    const chunked = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big))
        c.close()
      },
    })
    const request = new Request('https://app.example.com/', {
      method: 'POST',
      body: chunked,
      headers: { 'stripe-signature': 's' },
      duplex: 'half',
    } as RequestInit)
    expect((await withWebhook(webhook)(request)).status).toBe(413)
    expect(webhook).not.toHaveBeenCalled()
  })

  it('passes the raw body and signature through, and answers 200', async () => {
    const webhook = vi.fn(async () => 'processed' as const)
    const response = await withWebhook(webhook)(post('{"id":"evt_1"}', { 'stripe-signature': 'sig' }))
    expect(response.status).toBe(200)
    expect(webhook).toHaveBeenCalledWith('{"id":"evt_1"}', 'sig')
  })

  it('maps a bad signature to 400, billing off to 503 and a storage error to 500 (so Stripe retries)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = (e: Error) => withWebhook(() => Promise.reject(e))(post('{}'))
    expect((await fail(new AppError('unauthenticated', 'x'))).status).toBe(400)
    expect((await fail(new AppError('unavailable', 'x'))).status).toBe(503)
    expect((await fail(new Error('D1_ERROR'))).status).toBe(500)
    log.mockRestore()
  })
})

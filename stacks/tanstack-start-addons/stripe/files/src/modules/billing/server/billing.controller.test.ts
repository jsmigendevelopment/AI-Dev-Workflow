import { describe, expect, it, vi } from 'vitest'
import { billingController } from './billing.controller'
import type { BillingService } from './billing.service'

const ann = { userId: 'user_ann' }

describe('billing controller contract', () => {
  it('rejects a priceId or customerId in the body: those come from config and the session', async () => {
    const service = { checkout: vi.fn(), portal: vi.fn() } as unknown as BillingService
    const c = billingController(service)
    expect(await c.checkout(ann, { priceId: 'price_free' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
    expect(await c.portal(ann, { customerId: 'cus_bob' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
    expect(service.checkout).not.toHaveBeenCalled()
    expect(service.portal).not.toHaveBeenCalled()
  })

  it('returns the checkout URL in the envelope', async () => {
    const service = {
      checkout: async () => ({ url: 'https://checkout.stripe.test/x' }),
    } as unknown as BillingService
    expect(await billingController(service).checkout(ann, {})).toEqual({
      ok: true,
      data: { url: 'https://checkout.stripe.test/x' },
    })
  })
})

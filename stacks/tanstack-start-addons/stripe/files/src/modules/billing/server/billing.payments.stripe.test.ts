import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { stripeKeyAllowed, stripePayments } from './billing.payments.stripe'

// Real Stripe SDK signature checks, offline: we sign test payloads the way Stripe does.
const webhookSecret = 'whsec_test_secret'
const payments = stripePayments({ secretKey: 'sk_test_123', webhookSecret })
const sdk = new Stripe('sk_test_123')
const crypto = Stripe.createSubtleCryptoProvider()

const subscription = {
  id: 'evt_1',
  object: 'event',
  type: 'customer.subscription.updated',
  created: 1_700_000_000,
  data: {
    object: {
      id: 'sub_1',
      object: 'subscription',
      customer: 'cus_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1_702_592_000 }] },
    },
  },
}

async function sign(payload: string, secret = webhookSecret, timestamp = Math.floor(Date.now() / 1000)) {
  return sdk.webhooks.generateTestHeaderStringAsync({ payload, secret, timestamp, cryptoProvider: crypto })
}

describe('stripe adapter: webhook signatures (real SDK, no network)', () => {
  it('accepts a correctly signed event and reduces it to what the service needs', async () => {
    const body = JSON.stringify(subscription)
    expect(await payments.verifyWebhook(body, await sign(body))).toEqual({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      createdAt: 1_700_000_000_000,
      subscription: {
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        status: 'active',
        priceId: 'price_pro',
        currentPeriodEnd: 1_702_592_000_000,
      },
    })
  })

  it('rejects a tampered body, a wrong secret, a stale timestamp and garbage', async () => {
    const body = JSON.stringify(subscription)
    const tampered = body.replace('"active"', '"canceled"')
    expect(await payments.verifyWebhook(tampered, await sign(body))).toBeNull()
    expect(await payments.verifyWebhook(body, await sign(body, 'whsec_other'))).toBeNull()
    const stale = Math.floor(Date.now() / 1000) - 600
    expect(await payments.verifyWebhook(body, await sign(body, webhookSecret, stale))).toBeNull()
    expect(await payments.verifyWebhook(body, 't=1,v1=00')).toBeNull()
  })

  it('passes other event types through with no subscription', async () => {
    const body = JSON.stringify({ ...subscription, id: 'evt_2', type: 'invoice.paid', data: { object: {} } })
    expect(await payments.verifyWebhook(body, await sign(body))).toMatchObject({
      id: 'evt_2',
      subscription: null,
    })
  })
})

describe('stripe key guard', () => {
  it('allows test keys, and live keys only when explicitly allowed', () => {
    expect(stripeKeyAllowed('sk_test_abc', false)).toBe(true)
    expect(stripeKeyAllowed('rk_test_abc', false)).toBe(true)
    expect(stripeKeyAllowed('sk_live_abc', false)).toBe(false)
    expect(stripeKeyAllowed('sk_live_abc', true)).toBe(true)
    expect(stripeKeyAllowed('pk_test_abc', true)).toBe(false)
  })
})

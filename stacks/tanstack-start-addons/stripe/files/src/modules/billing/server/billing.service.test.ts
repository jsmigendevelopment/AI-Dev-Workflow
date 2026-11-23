import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/app-error'
import type { BillingEvent } from './billing.payments'
import { FAKE_SIGNATURE, memoryPaymentsClient } from './billing.payments.memory'
import { memoryBillingRepository } from './billing.repository.memory'
import { createBillingService } from './billing.service'

const ann = { userId: 'user_ann' }
const bob = { userId: 'user_bob' }

function setup({ configured = true } = {}) {
  const repo = memoryBillingRepository()
  const payments = memoryPaymentsClient()
  const service = createBillingService({
    repo,
    payments: configured ? payments.client : null,
    priceId: configured ? 'price_pro' : null,
    appUrl: 'https://app.example.com',
    now: () => 5000,
  })
  return { service, repo, calls: payments.calls }
}

const code = (run: Promise<unknown>) =>
  run.then(
    () => 'resolved',
    (e: unknown) => (e instanceof AppError ? e.code : 'threw something else'),
  )

const subscriptionEvent = (over: Partial<BillingEvent> = {}, status = 'active'): BillingEvent => ({
  id: 'evt_1',
  type: 'customer.subscription.updated',
  createdAt: 2000,
  subscription: {
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    status: status as 'active',
    priceId: 'price_pro',
    currentPeriodEnd: 9_000_000,
  },
  ...over,
})
const send = (service: ReturnType<typeof setup>['service'], event: BillingEvent, sig = FAKE_SIGNATURE) =>
  service.webhook(JSON.stringify(event), sig)

describe('billing service', () => {
  it('is off without Stripe: status says so, and every action fails closed', async () => {
    const { service } = setup({ configured: false })
    expect(await service.status(ann)).toEqual({
      enabled: false,
      status: 'none',
      currentPeriodEnd: null,
      canManage: false,
    })
    expect(await code(service.checkout(ann))).toBe('unavailable')
    expect(await code(service.portal(ann))).toBe('unavailable')
    expect(await code(service.webhook('{}', FAKE_SIGNATURE))).toBe('unavailable')
  })

  it('creates one Stripe customer per user and sends them to Checkout with the configured price', async () => {
    const { service, calls } = setup()
    expect(await service.checkout(ann)).toEqual({ url: 'https://checkout.stripe.test/cus_1' })
    await service.checkout(ann)
    expect(calls.filter((c) => c.method === 'createCustomer')).toHaveLength(1)
    expect(calls.at(-1)).toEqual({
      method: 'createCheckout',
      input: {
        customerId: 'cus_1',
        ownerId: 'user_ann',
        priceId: 'price_pro',
        successUrl: 'https://app.example.com/billing?checkout=success',
        cancelUrl: 'https://app.example.com/billing?checkout=cancelled',
      },
    })
  })

  it('refuses a second Checkout for someone already subscribed', async () => {
    const { service } = setup()
    await service.checkout(ann)
    await send(service, subscriptionEvent())
    expect(await code(service.checkout(ann))).toBe('conflict')
  })

  it("opens the portal only for the user's own customer", async () => {
    const { service } = setup()
    expect(await code(service.portal(ann))).toBe('not_found')
    await service.checkout(ann)
    expect(await service.portal(ann)).toEqual({ url: 'https://billing.stripe.test/cus_1' })
    expect(await code(service.portal(bob))).toBe('not_found')
  })

  it('rejects a webhook whose signature does not verify, and changes nothing', async () => {
    const { service } = setup()
    await service.checkout(ann)
    expect(await code(send(service, subscriptionEvent(), 'forged'))).toBe('unauthenticated')
    expect((await service.status(ann)).status).toBe('none')
  })

  it('applies a subscription event, and a redelivery of the same event is a duplicate', async () => {
    const { service } = setup()
    await service.checkout(ann)
    expect(await send(service, subscriptionEvent())).toBe('processed')
    expect(await service.status(ann)).toEqual({
      enabled: true,
      status: 'active',
      currentPeriodEnd: 9_000_000,
      canManage: true,
    })
    expect(await send(service, subscriptionEvent({}, 'canceled'))).toBe('duplicate')
    expect((await service.status(ann)).status).toBe('active')
  })

  it('never lets an older event overwrite a newer state (out-of-order delivery)', async () => {
    const { service } = setup()
    await service.checkout(ann)
    await send(service, subscriptionEvent({ id: 'evt_new', createdAt: 3000 }, 'canceled'))
    await send(service, subscriptionEvent({ id: 'evt_old', createdAt: 2000 }, 'active'))
    expect((await service.status(ann)).status).toBe('canceled')
  })

  it('acknowledges events it does not use', async () => {
    const { service } = setup()
    expect(await send(service, { id: 'evt_x', type: 'invoice.paid', createdAt: 1, subscription: null })).toBe(
      'ignored',
    )
  })
})

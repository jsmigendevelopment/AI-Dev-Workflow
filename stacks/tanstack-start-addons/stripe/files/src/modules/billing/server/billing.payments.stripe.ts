import Stripe from 'stripe'
import type { SubscriptionStatus } from '../types'
import type { BillingEvent, PaymentsClient } from './billing.payments'

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
}

/**
 * Test mode unless the person explicitly allows live mode (STRIPE_ALLOW_LIVE=true).
 * A live key without that flag turns billing off instead of charging real cards.
 */
export const stripeKeyAllowed = (secretKey: string, allowLive: boolean) =>
  /^(sk|rk)_test_/.test(secretKey) || (allowLive && /^(sk|rk)_live_/.test(secretKey))

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])

/** The Stripe adapter. Uses the SDK's fetch client and Web Crypto, which is what Workers have. */
export function stripePayments({ secretKey, webhookSecret }: StripeConfig): PaymentsClient {
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 })
  const crypto = Stripe.createSubtleCryptoProvider()

  return {
    async createCustomer({ ownerId }) {
      // Same key for the same user: a double click or a retry gets the same customer back.
      const customer = await stripe.customers.create(
        { metadata: { owner_id: ownerId } },
        { idempotencyKey: `customer/${ownerId}` },
      )
      return { customerId: customer.id }
    },

    async createCheckout({ customerId, ownerId, priceId, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: ownerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: { metadata: { owner_id: ownerId } },
      })
      if (!session.url) throw new Error('Stripe returned a Checkout session without a URL')
      return { url: session.url }
    },

    async createPortal({ customerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      })
      return { url: session.url }
    },

    async verifyWebhook(rawBody, signature) {
      let event: Stripe.Event
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          signature,
          webhookSecret,
          undefined,
          crypto,
        )
      } catch {
        return null // bad signature, stale timestamp or not JSON: all the same to the caller
      }
      return toBillingEvent(event)
    },
  }
}

function toBillingEvent(event: Stripe.Event): BillingEvent {
  const base = { id: event.id, type: event.type, createdAt: event.created * 1000 }
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return { ...base, subscription: null }
  const sub = event.data.object as Stripe.Subscription
  const item = sub.items.data[0]
  return {
    ...base,
    subscription: {
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      subscriptionId: sub.id,
      status: sub.status as SubscriptionStatus,
      priceId: item?.price.id ?? null,
      // Since API version 2025-03-31 the period lives on the subscription item.
      currentPeriodEnd: item ? item.current_period_end * 1000 : null,
    },
  }
}

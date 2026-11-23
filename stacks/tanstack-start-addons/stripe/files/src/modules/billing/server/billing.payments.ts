import type { SubscriptionState } from './billing.repository'

/** A verified webhook event, reduced to what the service needs. */
export interface BillingEvent {
  id: string
  type: string
  /** Epoch ms when Stripe created the event. Orders out-of-order deliveries. */
  createdAt: number
  /** Set for `customer.subscription.*` events. */
  subscription: (SubscriptionState & { customerId: string }) | null
}

/**
 * The payments port the service depends on. Adapters: Stripe (billing.payments.stripe.ts) and a
 * memory fake. The service never sees the SDK, a key or a raw Stripe object.
 */
export interface PaymentsClient {
  createCustomer(input: { ownerId: string }): Promise<{ customerId: string }>
  createCheckout(input: {
    customerId: string
    ownerId: string
    priceId: string
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string }>
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  /** Verifies the signature over the raw body. Null when it doesn't verify. */
  verifyWebhook(rawBody: string, signature: string): Promise<BillingEvent | null>
}

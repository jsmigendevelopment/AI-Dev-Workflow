import type { BillingEvent, PaymentsClient } from './billing.payments'

/** The signature the fake accepts. Real signature checks are tested on the Stripe adapter. */
export const FAKE_SIGNATURE = 'fake-valid-signature'

/** The test fake: records calls and returns predictable URLs. Webhook bodies are BillingEvent JSON. */
export function memoryPaymentsClient() {
  const calls: { method: string; input: unknown }[] = []
  let customers = 0
  const client: PaymentsClient = {
    async createCustomer(input) {
      calls.push({ method: 'createCustomer', input })
      return { customerId: `cus_${++customers}` }
    },
    async createCheckout(input) {
      calls.push({ method: 'createCheckout', input })
      return { url: `https://checkout.stripe.test/${input.customerId}` }
    },
    async createPortal(input) {
      calls.push({ method: 'createPortal', input })
      return { url: `https://billing.stripe.test/${input.customerId}` }
    },
    async verifyWebhook(rawBody, signature) {
      return signature === FAKE_SIGNATURE ? (JSON.parse(rawBody) as BillingEvent) : null
    },
  }
  return { client, calls }
}

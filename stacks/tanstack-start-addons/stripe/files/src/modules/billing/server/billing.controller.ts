import type { Actor } from '@/lib/actor'
import { respond } from '@/lib/respond'
import { getBillingInput, openPortalInput, startCheckoutInput } from '../schemas'
import type { BillingService } from './billing.service'

/** Raw input in, envelope out. Plain functions, contract-tested in Node. */
export const billingController = (service: BillingService) => ({
  status: (actor: Actor, raw: unknown) => respond(getBillingInput, raw, () => service.status(actor)),
  checkout: (actor: Actor, raw: unknown) => respond(startCheckoutInput, raw, () => service.checkout(actor)),
  portal: (actor: Actor, raw: unknown) => respond(openPortalInput, raw, () => service.portal(actor)),
})

export type BillingController = ReturnType<typeof billingController>

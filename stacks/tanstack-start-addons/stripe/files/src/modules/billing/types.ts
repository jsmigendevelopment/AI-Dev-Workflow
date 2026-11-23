import type * as z from 'zod'
import type { getBillingInput, openPortalInput, startCheckoutInput } from './schemas'

/** Stripe's subscription statuses, plus `none` for someone who never subscribed. */
export type SubscriptionStatus =
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'

/** What crosses the wire. No Stripe ids. */
export interface BillingDto {
  /** False when Stripe isn't configured: the UI hides the buttons. */
  enabled: boolean
  status: SubscriptionStatus
  /** Epoch ms, or null. */
  currentPeriodEnd: number | null
  /** True once there is a Stripe customer, so the portal can open. */
  canManage: boolean
}

export type StartCheckoutInput = z.input<typeof startCheckoutInput>
export type OpenPortalInput = z.input<typeof openPortalInput>
export type GetBillingInput = z.input<typeof getBillingInput>

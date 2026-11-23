import type { Actor } from '@/lib/actor'
import { AppError } from '@/lib/app-error'
import type { BillingDto } from '../types'
import type { PaymentsClient } from './billing.payments'
import type { BillingRepository, CustomerRow } from './billing.repository'

export interface BillingDeps {
  repo: BillingRepository
  /** Null when Stripe isn't configured (no keys, or a live key without permission). */
  payments: PaymentsClient | null
  priceId: string | null
  /** The app's origin, for Stripe's redirect URLs. */
  appUrl: string
  now: () => number
}

export type WebhookOutcome = 'processed' | 'ignored' | 'duplicate'

/** Statuses that mean "already paying": a second Checkout would double-charge. */
const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

const toDto = (enabled: boolean, row: CustomerRow | null): BillingDto => ({
  enabled,
  status: row?.status ?? 'none',
  currentPeriodEnd: row?.currentPeriodEnd ?? null,
  canManage: enabled && row !== null,
})

const notSetUp = () => new AppError('unavailable', 'Billing is not set up yet.')

/** Business rules only. No HTTP, no env, no SDK. */
export function createBillingService({ repo, payments, priceId, appUrl, now }: BillingDeps) {
  const enabled = payments !== null && priceId !== null
  return {
    async status(actor: Actor): Promise<BillingDto> {
      return toDto(enabled, await repo.findByOwner(actor.userId))
    },

    async checkout(actor: Actor): Promise<{ url: string }> {
      if (!payments || !priceId) throw notSetUp()
      let row = await repo.findByOwner(actor.userId)
      if (row && LIVE.has(row.status))
        throw new AppError('conflict', 'You already have a subscription. Manage it from the billing page.')
      if (!row) {
        const { customerId } = await payments.createCustomer({ ownerId: actor.userId })
        row = await repo.linkCustomer(actor.userId, customerId, now())
      }
      return payments.createCheckout({
        customerId: row.customerId,
        ownerId: actor.userId,
        priceId,
        successUrl: `${appUrl}/billing?checkout=success`,
        cancelUrl: `${appUrl}/billing?checkout=cancelled`,
      })
    },

    async portal(actor: Actor): Promise<{ url: string }> {
      if (!payments) throw notSetUp()
      const row = await repo.findByOwner(actor.userId)
      if (!row) throw new AppError('not_found', 'There is no billing account yet.')
      return payments.createPortal({ customerId: row.customerId, returnUrl: `${appUrl}/billing` })
    },

    /**
     * A Stripe webhook. Verified first; an event id already handled does nothing. Applying a
     * subscription is ordered by event time, so a late, older event never overwrites a newer state.
     */
    async webhook(rawBody: string, signature: string): Promise<WebhookOutcome> {
      if (!payments) throw notSetUp()
      const event = await payments.verifyWebhook(rawBody, signature)
      if (!event) throw new AppError('unauthenticated', 'Invalid signature.')
      if (await repo.hasEvent(event.id)) return 'duplicate'
      let outcome: WebhookOutcome = 'ignored'
      if (event.subscription) {
        const { customerId, ...state } = event.subscription
        await repo.applySubscription(customerId, state, event.createdAt, now())
        outcome = 'processed'
      }
      // Recorded last: if applying failed, Stripe retries and the event runs again (it's idempotent).
      await repo.recordEvent(event.id, event.type, now())
      return outcome
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>

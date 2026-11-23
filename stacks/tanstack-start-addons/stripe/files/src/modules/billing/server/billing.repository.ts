import type { SubscriptionStatus } from '../types'

/** The stored shape. Never leaves the server. */
export interface CustomerRow {
  ownerId: string
  customerId: string
  subscriptionId: string | null
  status: SubscriptionStatus
  priceId: string | null
  currentPeriodEnd: number | null
  lastEventAt: number
  updatedAt: number
}

export interface SubscriptionState {
  subscriptionId: string
  status: SubscriptionStatus
  priceId: string | null
  currentPeriodEnd: number | null
}

/** The port. Each method is one atomic statement. "Nothing matched" is a value, not an exception. */
export interface BillingRepository {
  findByOwner(ownerId: string): Promise<CustomerRow | null>
  /** Stores the owner → customer link. If the owner already has one, keeps it and returns it. */
  linkCustomer(ownerId: string, customerId: string, now: number): Promise<CustomerRow>
  /**
   * Applies a subscription change from an event created at `eventAt`, unless a newer event was
   * already applied (webhooks arrive out of order). False when nothing changed.
   */
  applySubscription(
    customerId: string,
    state: SubscriptionState,
    eventAt: number,
    now: number,
  ): Promise<boolean>
  hasEvent(eventId: string): Promise<boolean>
  /** Records an event as handled. Recording one twice is not an error. */
  recordEvent(eventId: string, type: string, now: number): Promise<void>
}

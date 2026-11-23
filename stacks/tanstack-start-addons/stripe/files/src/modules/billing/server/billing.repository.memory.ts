import type { BillingRepository, CustomerRow } from './billing.repository'

/** The test fake. Passes the same contract suite as the D1 adapter. */
export function memoryBillingRepository(): BillingRepository {
  const customers = new Map<string, CustomerRow>()
  const events = new Set<string>()
  return {
    async findByOwner(ownerId) {
      const row = customers.get(ownerId)
      return row ? { ...row } : null
    },
    async linkCustomer(ownerId, customerId, now) {
      const existing = customers.get(ownerId)
      if (existing) return { ...existing }
      if ([...customers.values()].some((c) => c.customerId === customerId))
        throw new Error('UNIQUE constraint failed: billing_customers.customer_id')
      const row: CustomerRow = {
        ownerId,
        customerId,
        subscriptionId: null,
        status: 'none',
        priceId: null,
        currentPeriodEnd: null,
        lastEventAt: 0,
        updatedAt: now,
      }
      customers.set(ownerId, row)
      return { ...row }
    },
    async applySubscription(customerId, state, eventAt, now) {
      const row = [...customers.values()].find((c) => c.customerId === customerId)
      if (!row || row.lastEventAt > eventAt) return false
      Object.assign(row, state, { lastEventAt: eventAt, updatedAt: now })
      return true
    },
    async hasEvent(eventId) {
      return events.has(eventId)
    },
    async recordEvent(eventId) {
      events.add(eventId)
    },
  }
}

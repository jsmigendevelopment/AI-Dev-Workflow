import { and, eq, lte } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { BillingRepository, CustomerRow } from './billing.repository'
import { billingCustomers, billingEvents } from './billing.table'

const toRow = (r: typeof billingCustomers.$inferSelect): CustomerRow => ({
  ...r,
  status: r.status as CustomerRow['status'],
})

/** The D1 adapter. Ordering and dedupe are in the SQL, so concurrent webhooks can't race. */
export function drizzleBillingRepository(db: Db): BillingRepository {
  const byOwner = async (ownerId: string) => {
    const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.ownerId, ownerId))
    return row ? toRow(row) : null
  }
  return {
    findByOwner: byOwner,

    async linkCustomer(ownerId, customerId, now) {
      await db
        .insert(billingCustomers)
        .values({ ownerId, customerId, status: 'none', lastEventAt: 0, updatedAt: now })
        .onConflictDoNothing({ target: billingCustomers.ownerId })
      const row = await byOwner(ownerId)
      if (!row) throw new Error('billing customer link was not stored')
      return row
    },

    async applySubscription(customerId, state, eventAt, now) {
      const rows = await db
        .update(billingCustomers)
        .set({ ...state, lastEventAt: eventAt, updatedAt: now })
        .where(and(eq(billingCustomers.customerId, customerId), lte(billingCustomers.lastEventAt, eventAt)))
        .returning({ ownerId: billingCustomers.ownerId })
      return rows.length === 1
    },

    async hasEvent(eventId) {
      const rows = await db
        .select({ id: billingEvents.id })
        .from(billingEvents)
        .where(eq(billingEvents.id, eventId))
      return rows.length > 0
    },

    async recordEvent(eventId, type, now) {
      await db.insert(billingEvents).values({ id: eventId, type, receivedAt: now }).onConflictDoNothing()
    },
  }
}

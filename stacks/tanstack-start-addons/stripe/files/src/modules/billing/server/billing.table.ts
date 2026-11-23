import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** One row per user who has a Stripe customer. The subscription fields mirror Stripe's. */
export const billingCustomers = sqliteTable('billing_customers', {
  ownerId: text('owner_id').primaryKey(),
  customerId: text('customer_id').notNull().unique(),
  subscriptionId: text('subscription_id'),
  status: text('status').notNull(), // SubscriptionStatus
  priceId: text('price_id'),
  currentPeriodEnd: integer('current_period_end'), // epoch ms
  lastEventAt: integer('last_event_at').notNull(), // epoch ms of the newest Stripe event applied
  updatedAt: integer('updated_at').notNull(),
})

/** Webhook events already handled, by Stripe event id. Makes redelivery a no-op. */
export const billingEvents = sqliteTable('billing_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: integer('received_at').notNull(),
})

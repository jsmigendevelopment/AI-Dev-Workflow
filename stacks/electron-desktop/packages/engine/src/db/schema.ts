import { PREFERENCE_KEYS } from '@app/contract/preferences'
import { sql } from 'drizzle-orm'
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The tables. A change here is a decision, then `pnpm --filter @app/engine db:generate` and a line in
// db/migrations.ts.

/** What a person did that can't be taken back, in the past tense. Add one per audited action. */
const AUDIT_ACTIONS = ['preferences_changed'] as const
const AUDIT_ACTORS = ['person'] as const
const AUDIT_OBJECT_TYPES = ['preferences'] as const

// The lists are constants in this repo, never input, so quoting them into the SQL is safe.
const oneOf = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}

/** One row per preference; `value` is JSON checked with the contract's zod schema. */
export const preferences = sqliteTable(
  'preferences',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
    ...timestamps,
  },
  (table) => [check('preferences_key_check', sql`${table.key} in (${oneOf(PREFERENCE_KEYS)})`)],
)

/** One row per action that can't be taken back. No values: only who, what and the request ID. */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    actor: text('actor', { enum: AUDIT_ACTORS }).notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    objectType: text('object_type', { enum: AUDIT_OBJECT_TYPES }).notNull(),
    objectId: text('object_id'),
    requestId: text('request_id').notNull(),
    ...timestamps,
  },
  (table) => [
    check('audit_events_actor_check', sql`${table.actor} in (${oneOf(AUDIT_ACTORS)})`),
    check('audit_events_action_check', sql`${table.action} in (${oneOf(AUDIT_ACTIONS)})`),
    check('audit_events_object_type_check', sql`${table.objectType} in (${oneOf(AUDIT_OBJECT_TYPES)})`),
  ],
)

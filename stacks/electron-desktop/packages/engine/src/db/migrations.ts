import preferencesAndAuditEvents from './migrations/0000_preferences_and_audit_events.sql?raw'

/** One forward-only migration: drizzle-kit's tag and its SQL. */
export interface Migration {
  tag: string
  sql: string
}

/**
 * Every migration, oldest first, as drizzle-kit wrote them into migrations/ (`pnpm db:generate`).
 * The bundle carries the SQL, so the packaged app reads no migration files.
 */
export const MIGRATIONS: readonly Migration[] = [
  { tag: '0000_preferences_and_audit_events', sql: preferencesAndAuditEvents },
]

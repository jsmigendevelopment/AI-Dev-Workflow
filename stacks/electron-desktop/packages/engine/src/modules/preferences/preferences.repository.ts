import { newId } from '@app/contract/ids'
import type { PreferenceKey } from '@app/contract/preferences'
import { sql } from 'drizzle-orm'

import type { Db } from '../../db/database.ts'
import { auditEvents, preferences } from '../../db/schema.ts'
import type { Clock } from '../../lib/time.ts'

/** Stored preference values by key, parsed from their JSON. A key never saved is absent. */
export type StoredPreferences = Partial<Record<PreferenceKey, unknown>>

/** Who asked for a write: the command's request ID, the same one the logs carry. */
export interface AuditContext {
  requestId: string
}

/** Where the preferences service reads and writes. The SQLite one below; `preferences.memory.ts` for tests. */
export interface PreferencesRepository {
  read(): Promise<StoredPreferences>
  /** Writes the values and one `preferences_changed` audit row with no values: all or nothing. */
  save(values: StoredPreferences, audit: AuditContext): Promise<void>
}

/** What the SQLite repository needs: the client (which throws `data_unreadable`) and a clock. */
export interface PreferencesSqliteDeps {
  db(): Db
  clock: Clock
}

/** The preferences repository on the data file's `preferences` and `audit_events` tables. */
export function createPreferencesRepository({ db, clock }: PreferencesSqliteDeps): PreferencesRepository {
  return {
    async read() {
      const rows = await db().select({ key: preferences.key, value: preferences.value }).from(preferences)
      return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]))
    },
    async save(values, { requestId }) {
      const client = db()
      const now = clock().toISOString()
      const writes = Object.entries(values).map(([key, value]) =>
        client
          .insert(preferences)
          .values({ id: newId(), key, value: JSON.stringify(value), createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: preferences.key,
            set: { value: sql`excluded.value`, updatedAt: now },
          }),
      )
      const audit = client.insert(auditEvents).values({
        id: newId(),
        actor: 'person',
        action: 'preferences_changed',
        objectType: 'preferences',
        objectId: null,
        requestId,
        createdAt: now,
        updatedAt: now,
      })
      // One batch is one transaction (db/database.ts), so a failed write leaves nothing behind.
      await client.batch([audit, ...writes])
    },
  }
}

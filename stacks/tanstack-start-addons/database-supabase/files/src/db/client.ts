import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

/** Any Drizzle Postgres database: node-postgres in the Worker, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT>

/**
 * Build per request from the Hyperdrive binding. Hyperdrive keeps the real connection pool near
 * the database, so this pool is small and short-lived: connections open on the first query.
 * Only the composition root and repository tests call this.
 */
export const createDb = (hyperdrive: Hyperdrive): Db =>
  drizzle({ client: new Pool({ connectionString: hyperdrive.connectionString, max: 5 }) })

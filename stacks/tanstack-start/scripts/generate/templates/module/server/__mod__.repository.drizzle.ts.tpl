import { and, desc, eq } from 'drizzle-orm'

import type { Db } from '@/db/client'

import type { __Plural__Repository } from './__mod__.repository'
import { __plural__ } from './__mod__.table'

/** The database adapter. Ownership is part of every WHERE, so another user's row never matches. */
export function drizzle__Plural__Repository(db: Db): __Plural__Repository {
  return {
    listByOwner: (ownerId, limit) =>
      db
        .select()
        .from(__plural__)
        .where(eq(__plural__.ownerId, ownerId))
        .orderBy(desc(__plural__.createdAt), desc(__plural__.id))
        .limit(limit),

    async insert(row) {
      await db.insert(__plural__).values(row)
    },

    async delete(ownerId, id) {
      const where = and(eq(__plural__.id, id), eq(__plural__.ownerId, ownerId))
      const rows = await db.delete(__plural__).where(where).returning({ id: __plural__.id })
      return rows.length === 1
    },
  }
}

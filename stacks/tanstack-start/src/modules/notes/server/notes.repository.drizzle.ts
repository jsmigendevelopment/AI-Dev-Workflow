import { and, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '@/db/client'

import type { NotesRepository } from './notes.repository'
import { notes } from './notes.table'

/** The D1 adapter. Ownership is part of every WHERE, so another user's row never matches. */
export function drizzleNotesRepository(db: Db): NotesRepository {
  const mine = (ownerId: string, id: string) => and(eq(notes.id, id), eq(notes.ownerId, ownerId))
  return {
    listByOwner: (ownerId, { after, limit }) =>
      db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, ownerId),
            after ? sql`(${notes.createdAt}, ${notes.id}) < (${after.createdAt}, ${after.id})` : undefined,
          ),
        )
        .orderBy(desc(notes.createdAt), desc(notes.id))
        .limit(limit),

    async insert(row) {
      await db.insert(notes).values(row)
    },

    async rename(ownerId, id, title, updatedAt) {
      const rows = await db.update(notes).set({ title, updatedAt }).where(mine(ownerId, id)).returning()
      return rows[0] ?? null
    },

    async delete(ownerId, id) {
      const rows = await db.delete(notes).where(mine(ownerId, id)).returning({ id: notes.id })
      return rows.length === 1
    },
  }
}

import { and, asc, desc, eq, sql } from 'drizzle-orm'

import type { Db } from '@/db/client'

import type { ListOptions, NotesRepository } from './notes.repository'
import { notes } from './notes.table'

const afterPosition = (after: ListOptions['after'], order: ListOptions['order']) => {
  if (!after) return undefined
  return order === 'oldest'
    ? sql`(${notes.createdAt}, ${notes.id}) > (${after.createdAt}, ${after.id})`
    : sql`(${notes.createdAt}, ${notes.id}) < (${after.createdAt}, ${after.id})`
}

// instr() instead of LIKE, so `%` and `_` in the search are plain characters. SQLite's lower()
// folds ASCII only; the memory fake does the same.
const titleHas = (q: string | undefined) =>
  q ? sql`instr(lower(${notes.title}), lower(${q})) > 0` : undefined

/** The D1 adapter. Ownership is part of every WHERE, so another user's row never matches. */
export function drizzleNotesRepository(db: Db): NotesRepository {
  const mine = (ownerId: string, id: string) => and(eq(notes.id, id), eq(notes.ownerId, ownerId))
  return {
    listByOwner: (ownerId, { after, limit, q, order = 'newest' }) => {
      const by = order === 'newest' ? desc : asc
      return db
        .select()
        .from(notes)
        .where(and(eq(notes.ownerId, ownerId), afterPosition(after, order), titleHas(q)))
        .orderBy(by(notes.createdAt), by(notes.id))
        .limit(limit)
    },

    async findByOwner(ownerId, id) {
      const rows = await db.select().from(notes).where(mine(ownerId, id)).limit(1)
      return rows[0] ?? null
    },

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

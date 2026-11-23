import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { FileRow, FilesRepository } from './files.repository'
import { files } from './files.table'

const toRow = (r: typeof files.$inferSelect): FileRow => ({ ...r, type: r.type as FileRow['type'] })

/** The D1 adapter. Ownership is part of every WHERE, so another user's row never matches. */
export function drizzleFilesRepository(db: Db): FilesRepository {
  const mine = (ownerId: string, id: string) => and(eq(files.id, id), eq(files.ownerId, ownerId))
  return {
    async insertPending(row) {
      await db.insert(files).values(row).onConflictDoNothing({ target: files.id })
      const [stored] = await db.select().from(files).where(eq(files.id, row.id))
      if (!stored) throw new Error('file row was not stored')
      return toRow(stored)
    },

    async findOwned(ownerId, id) {
      const [row] = await db.select().from(files).where(mine(ownerId, id))
      return row ? toRow(row) : null
    },

    async markReady(ownerId, id, updatedAt) {
      const rows = await db
        .update(files)
        .set({ status: 'ready', updatedAt })
        .where(and(mine(ownerId, id), eq(files.status, 'pending')))
        .returning({ id: files.id })
      return rows.length === 1
    },

    async listReady(ownerId, { after, limit }) {
      const rows = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.ownerId, ownerId),
            eq(files.status, 'ready'),
            after ? sql`(${files.createdAt}, ${files.id}) < (${after.createdAt}, ${after.id})` : undefined,
          ),
        )
        .orderBy(desc(files.createdAt), desc(files.id))
        .limit(limit)
      return rows.map(toRow)
    },

    async delete(ownerId, id) {
      const [row] = await db.delete(files).where(mine(ownerId, id)).returning()
      return row ? toRow(row) : null
    },

    async listStalePending(before, limit) {
      const rows = await db
        .select()
        .from(files)
        .where(and(eq(files.status, 'pending'), lt(files.createdAt, before)))
        .orderBy(asc(files.createdAt))
        .limit(limit)
      return rows.map(toRow)
    },

    async deletePending(id) {
      const rows = await db
        .delete(files)
        .where(and(eq(files.id, id), eq(files.status, 'pending')))
        .returning({ id: files.id })
      return rows.length === 1
    },
  }
}

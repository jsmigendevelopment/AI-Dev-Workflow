import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    createdAt: integer('created_at').notNull(), // epoch ms, set by the server
    updatedAt: integer('updated_at').notNull(),
  },
  // Matches the list query: WHERE owner_id = ? ORDER BY created_at DESC, id DESC
  (t) => [index('notes_owner_created').on(t.ownerId, t.createdAt, t.id)],
)

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** One metadata row per file. The bytes live in R2 under `key`; the row is written first. */
export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    key: text('key').notNull(), // `${ownerId}/${id}`: never the user's file name
    name: text('name').notNull(),
    type: text('type').notNull(),
    size: integer('size').notNull(),
    status: text('status', { enum: ['pending', 'ready'] }).notNull(),
    createdAt: integer('created_at').notNull(), // epoch ms
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('files_owner_created').on(t.ownerId, t.createdAt, t.id),
    index('files_status_created').on(t.status, t.createdAt),
  ],
)

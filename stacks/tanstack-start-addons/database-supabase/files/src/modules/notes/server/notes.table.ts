import { bigint, index, pgTable, text } from 'drizzle-orm/pg-core'

export const notes = pgTable(
  'notes',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(), // epoch ms, set by the server
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  // Matches the list query: WHERE owner_id = ? ORDER BY created_at DESC, id DESC
  (t) => [index('notes_owner_created').on(t.ownerId, t.createdAt, t.id)],
  // Supabase exposes the public schema through its Data API. RLS with no policies means the anon
  // and authenticated roles can read nothing; the Worker connects as the owner and isn't affected.
).enableRLS()

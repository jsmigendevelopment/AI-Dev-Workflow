__TABLE_IMPORT__

/** One row per __word__, owned by one user. Times are epoch ms in UTC, set by the server. */
export const __plural__ = __TABLE_FN__(
  '__table__',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    createdAt: __TIME__('created_at'__TIME_MODE__).notNull(),
    updatedAt: __TIME__('updated_at'__TIME_MODE__).notNull(),
  },
  // Matches the list query: WHERE owner_id = ? ORDER BY created_at DESC, id DESC
  (t) => [index('__table___owner_created').on(t.ownerId, t.createdAt, t.id)],
)__RLS__

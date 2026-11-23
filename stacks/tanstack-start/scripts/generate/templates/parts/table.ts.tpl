__TABLE_IMPORT__

/** __Title__. Times are epoch ms in UTC, set by the server; every write updates updated_at. */
export const __var__ = __TABLE_FN__('__table__', {
  id: text('id').primaryKey(),
  createdAt: __TIME__('created_at'__TIME_MODE__).notNull(),
  updatedAt: __TIME__('updated_at'__TIME_MODE__).notNull(),
})__RLS__

import * as z from 'zod'

/**
 * Keyset paging. The client sends `cursor` (opaque, from the last page) and `limit`;
 * the server answers `{ items, nextCursor }`, where null means the end.
 * Query-string values arrive as text, so `limit` is coerced.
 */
export const pageQuery = z.strictObject({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
/** What a client sends (z.input would type the coerced `limit` as unknown). */
export interface PageQuery {
  cursor?: string | undefined
  limit?: number | undefined
}

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() })

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

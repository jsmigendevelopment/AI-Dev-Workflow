/** One page of a keyset-paged list. `nextCursor` is opaque; null means the end. */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** Keyset position: the sort columns of the last row the client saw. */
export interface Position {
  createdAt: number
  id: string
}

export const encodeCursor = (p: Position): string => btoa(JSON.stringify([p.createdAt, p.id]))

/** Null for "no cursor"; undefined for a cursor that is not one of ours. */
export function decodeCursor(cursor: string | undefined): Position | null | undefined {
  if (!cursor) return null
  try {
    const value: unknown = JSON.parse(atob(cursor))
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'string')
      return { createdAt: value[0], id: value[1] }
  } catch {
    // fall through
  }
  return undefined
}

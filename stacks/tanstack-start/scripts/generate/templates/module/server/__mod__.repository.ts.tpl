/** The stored shape. Never leaves the server: the service maps it to a __Single__Dto. */
export interface __Single__Row {
  id: string
  ownerId: string
  title: string
  createdAt: number
  updatedAt: number
}

/**
 * The port the service depends on. Every method is scoped by owner and reports "nothing matched"
 * as a value, never as an exception.
 */
export interface __Plural__Repository {
  /** Newest first (createdAt, then id). */
  listByOwner(ownerId: string, limit: number): Promise<__Single__Row[]>
  insert(row: __Single__Row): Promise<void>
  /** False when no row matched id + owner. */
  delete(ownerId: string, id: string): Promise<boolean>
}

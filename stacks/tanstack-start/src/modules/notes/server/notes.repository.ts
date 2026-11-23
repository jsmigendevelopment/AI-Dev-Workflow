import type { Position } from '@/lib/page'

/** The stored shape. Never leaves the server: the service maps it to a NoteDto. */
export interface NoteRow {
  id: string
  ownerId: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Which notes and in what order. `q` matches part of the title, ignoring ASCII case. */
export interface ListOptions {
  after: Position | null
  limit: number
  q?: string | undefined
  /** Newest (createdAt, then id, descending) by default; oldest is the same keys ascending. */
  order?: 'newest' | 'oldest' | undefined
}

/**
 * The port the service depends on. Every method is one atomic statement, is scoped by owner,
 * and reports "nothing matched" as a value (null or false), never as an exception.
 */
export interface NotesRepository {
  /** In `order`, strictly after `after` in that order. */
  listByOwner(ownerId: string, opts: ListOptions): Promise<NoteRow[]>
  /** Null when no row matched id + owner. */
  findByOwner(ownerId: string, id: string): Promise<NoteRow | null>
  insert(row: NoteRow): Promise<void>
  /** Null when no row matched id + owner. */
  rename(ownerId: string, id: string, title: string, updatedAt: number): Promise<NoteRow | null>
  /** False when no row matched id + owner. */
  delete(ownerId: string, id: string): Promise<boolean>
}

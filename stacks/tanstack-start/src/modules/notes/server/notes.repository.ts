import type { Position } from '@/lib/page'

/** The stored shape. Never leaves the server: the service maps it to a NoteDto. */
export interface NoteRow {
  id: string
  ownerId: string
  title: string
  createdAt: number
  updatedAt: number
}

/**
 * The port the service depends on. Every method is one atomic statement, is scoped by owner,
 * and reports "nothing matched" as a value (null or false), never as an exception.
 */
export interface NotesRepository {
  /** Newest first (createdAt, then id), strictly after `after`. */
  listByOwner(ownerId: string, opts: { after: Position | null; limit: number }): Promise<NoteRow[]>
  insert(row: NoteRow): Promise<void>
  /** Null when no row matched id + owner. */
  rename(ownerId: string, id: string, title: string, updatedAt: number): Promise<NoteRow | null>
  /** False when no row matched id + owner. */
  delete(ownerId: string, id: string): Promise<boolean>
}

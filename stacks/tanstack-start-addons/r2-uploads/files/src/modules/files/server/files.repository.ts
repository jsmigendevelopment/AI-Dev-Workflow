import type { Position } from '@/lib/page'
import type { FileStatus, FileType } from '../types'

/** The stored shape. Never leaves the server. */
export interface FileRow {
  id: string
  ownerId: string
  key: string
  name: string
  type: FileType
  size: number
  status: FileStatus
  createdAt: number
  updatedAt: number
}

/** The metadata port. Owner-scoped; "nothing matched" is null or false, not an exception. */
export interface FilesRepository {
  /** Inserts a pending row. If the id already exists, stores nothing and returns the existing row. */
  insertPending(row: FileRow): Promise<FileRow>
  findOwned(ownerId: string, id: string): Promise<FileRow | null>
  /** Pending → ready. False if no pending row matched id + owner. */
  markReady(ownerId: string, id: string, updatedAt: number): Promise<boolean>
  /** Ready files, newest first (createdAt, then id), strictly after `after`. */
  listReady(ownerId: string, opts: { after: Position | null; limit: number }): Promise<FileRow[]>
  /** Deletes the row. Null if no row matched id + owner. */
  delete(ownerId: string, id: string): Promise<FileRow | null>
  /** Pending rows created before `before`: uploads that never finished. */
  listStalePending(before: number, limit: number): Promise<FileRow[]>
  /** Deletes a row only while it is still pending (for the sweep). */
  deletePending(id: string): Promise<boolean>
}

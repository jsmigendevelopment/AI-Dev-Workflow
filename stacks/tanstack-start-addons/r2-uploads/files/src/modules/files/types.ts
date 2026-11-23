import type * as z from 'zod'
import type { ALLOWED_TYPES, createUploadInput, deleteFileInput, listFilesInput } from './schemas'

export type FileType = (typeof ALLOWED_TYPES)[number]
export type FileStatus = 'pending' | 'ready'

/** What crosses the wire. No owner id, no storage key. */
export interface FileDto {
  id: string
  name: string
  type: FileType
  size: number
  status: FileStatus
  createdAt: number
}

export interface UploadTicket {
  id: string
  /** Where the browser PUTs the bytes (same origin). */
  uploadUrl: string
}

export type CreateUploadInput = z.input<typeof createUploadInput>
export type ListFilesInput = z.input<typeof listFilesInput>
export type DeleteFileInput = z.input<typeof deleteFileInput>

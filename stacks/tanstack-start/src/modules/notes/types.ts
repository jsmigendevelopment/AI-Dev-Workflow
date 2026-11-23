import type * as z from 'zod'
import type { createNoteInput, deleteNoteInput, listNotesInput, renameNoteInput } from './schemas'

/** What crosses the wire. No owner id. */
export interface NoteDto {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Callers' view of the inputs (`limit` is optional because the schema defaults it). */
export type ListNotesInput = z.input<typeof listNotesInput>
export type CreateNoteInput = z.input<typeof createNoteInput>
export type RenameNoteInput = z.input<typeof renameNoteInput>
export type DeleteNoteInput = z.input<typeof deleteNoteInput>

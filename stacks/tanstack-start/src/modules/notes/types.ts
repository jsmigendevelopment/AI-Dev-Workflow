import type * as z from 'zod'

import type { createNoteInput, deleteNoteInput, getNoteInput, noteSort, renameNoteInput } from './schemas'

/** What crosses the wire. No owner id. */
export interface NoteDto {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Callers' view of the inputs (`limit` is optional because the schema defaults it; written out
 * because z.input of a coerced number is `unknown`). */
export interface ListNotesInput {
  cursor?: string | undefined
  limit?: number | undefined
}
export type NoteSort = z.output<typeof noteSort>
/** The list this app's page asks for: the paging above plus a title filter and an order. */
export interface BrowseNotesInput extends ListNotesInput {
  q?: string | undefined
  sort?: NoteSort | undefined
}
export type GetNoteInput = z.input<typeof getNoteInput>
export type CreateNoteInput = z.input<typeof createNoteInput>
export type RenameNoteInput = z.input<typeof renameNoteInput>
export type DeleteNoteInput = z.input<typeof deleteNoteInput>

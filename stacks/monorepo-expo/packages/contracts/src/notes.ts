import * as z from 'zod'
import { page, pageQuery, type PageQuery } from './paging'

// The notes resource of /api/v1. Input schemas are strict: an unknown field is a `validation`
// error, never silently dropped. Messages match the web pack's src/modules/notes/schemas.ts.

export const noteTitle = z
  .string()
  .trim()
  .min(1, 'Give the note a title.')
  .max(200, 'Keep the title under 200 characters.')

export const noteId = z.uuid()

/** What crosses the wire. No owner id. Times are epoch milliseconds. */
export const noteDto = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type NoteDto = z.infer<typeof noteDto>

/** GET /api/v1/notes?cursor&limit */
export const listNotesQuery = pageQuery
export type ListNotesQuery = PageQuery
export const notesPage = page(noteDto)

/** POST /api/v1/notes */
export const createNoteBody = z.strictObject({ title: noteTitle })
export type CreateNoteBody = z.input<typeof createNoteBody>

/** PATCH /api/v1/notes/:id (the id is in the path, not the body) */
export const renameNoteBody = z.strictObject({ title: noteTitle })
export type RenameNoteBody = z.input<typeof renameNoteBody>

/** DELETE /api/v1/notes/:id answers the deleted id. */
export const deletedNote = z.object({ id: z.string() })
export type DeletedNote = z.infer<typeof deletedNote>

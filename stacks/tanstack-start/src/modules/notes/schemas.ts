import * as z from 'zod'

// The wire contract, shared by the client forms and the server controller.
// Strict objects: an unknown field is a validation error, not silently dropped.

export const noteTitle = z
  .string()
  .trim()
  .min(1, 'Give the note a title.')
  .max(200, 'Keep the title under 200 characters.')

export const listNotesInput = z.strictObject({
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const createNoteInput = z.strictObject({ title: noteTitle })

export const renameNoteInput = z.strictObject({ id: z.uuid(), title: noteTitle })

export const deleteNoteInput = z.strictObject({ id: z.uuid() })

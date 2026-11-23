import * as z from 'zod'

// The wire contract, shared by the client forms and the server controller.
// Strict objects: an unknown field is a validation error, not silently dropped.

export const noteTitle = z
  .string()
  .trim()
  .min(1, 'Give the note a title.')
  .max(200, 'Keep the title under 200 characters.')

// Identical to the /api/v1 contract (stacks/monorepo-expo/packages/contracts/src/notes.ts and
// paging.ts), so server functions and the HTTP API accept exactly the same input. `limit` is
// coerced because the query string carries text.
export const listNotesInput = z.strictObject({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const createNoteInput = z.strictObject({ title: noteTitle })

/** PATCH /api/v1/notes/:id: the id is in the path, so the body has the title only. */
export const renameNoteBody = z.strictObject({ title: noteTitle })

export const renameNoteInput = z.strictObject({ id: z.uuid(), title: noteTitle })

export const deleteNoteInput = z.strictObject({ id: z.uuid() })

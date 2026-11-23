import * as z from 'zod'

// The wire contract, shared by the form and the server controller.
// Strict objects: an unknown field is a validation error, not silently dropped.

export const list__Plural__Input = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const create__Single__Input = z.strictObject({
  title: z.string().trim().min(1, 'Give it a title.').max(200, 'Keep the title under 200 characters.'),
})

export const delete__Single__Input = z.strictObject({ id: z.uuid() })

import * as z from 'zod'

// A queue message is input like any other: parsed, strict, bounded.
export const jobMessage = z.strictObject({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  payload: z
    .record(z.string().max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
    .optional(),
})

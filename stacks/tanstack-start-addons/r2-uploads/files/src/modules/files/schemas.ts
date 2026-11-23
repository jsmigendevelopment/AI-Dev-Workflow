import * as z from 'zod'

/** The limits. Change them here: the form, the server function and the upload route all read these. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

export const fileName = z
  .string()
  .trim()
  .min(1, 'The file needs a name.')
  .max(200, 'Keep the file name under 200 characters.')
  .refine((n) => !/[\p{Cc}\p{Cf}/\\]/u.test(n), 'That file name has characters we can’t store.')

/** Step 1: declare the upload. The client makes the id, so a retry of the same upload is safe. */
export const createUploadInput = z.strictObject({
  id: z.uuid(),
  name: fileName,
  type: z.enum(ALLOWED_TYPES, 'That file type isn’t allowed.'),
  size: z
    .number()
    .int()
    .min(1, 'The file is empty.')
    .max(MAX_FILE_BYTES, 'The file is too big (10 MB at most).'),
})

export const listFilesInput = z.strictObject({
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const deleteFileInput = z.strictObject({ id: z.uuid() })

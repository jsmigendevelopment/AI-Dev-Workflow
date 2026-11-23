import * as z from 'zod'

import { type ApiResult, AppError } from './app-error'
import { logger } from './logger'

/**
 * The controller's whole job, once: parse the raw input, run one service call, map the outcome
 * to the envelope. It never throws, and it never sends a cause, a stack or SQL to the client.
 */
export async function respond<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  run: (input: z.output<S>) => Promise<T>,
): Promise<ApiResult<T>> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const { formErrors, fieldErrors } = z.flattenError(parsed.error)
    const fields = fieldErrors as Record<string, string[]>
    if (formErrors.length > 0) fields._ = formErrors
    return { ok: false, error: { code: 'validation', message: 'Some fields need attention.', fields } }
  }
  try {
    return { ok: true, data: await run(parsed.data) }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.toProblem() }
    logger.error('request_unhandled', { error }) // the stack stays in the Worker log
    return { ok: false, error: { code: 'internal', message: 'Something went wrong. Try again.' } }
  }
}

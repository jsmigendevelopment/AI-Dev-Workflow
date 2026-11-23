import * as z from 'zod'

/**
 * One error vocabulary for every client and server. Each code has one HTTP status, which the
 * /api/v1 routes answer with. Same codes as the web pack's `src/lib/app-error.ts`.
 */
export const ERROR_STATUS = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
} as const
export type ErrorCode = keyof typeof ERROR_STATUS

export const errorCode = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]])

/** The wire shape of a failure. `message` is safe to show: never a stack, SQL or a secret. */
export const apiProblem = z.object({
  code: errorCode,
  message: z.string(),
  /** `validation` only: messages per input field; `_` holds form-level messages. */
  fields: z.record(z.string(), z.array(z.string())).optional(),
})
export type ApiProblem = z.infer<typeof apiProblem>

/** Every /api/v1 response body. Expected failures are data, not exceptions. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiProblem }

/** The envelope schema around one data schema. Unknown envelope keys are tolerated (forward compatible). */
export const apiResult = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: apiProblem }),
  ])

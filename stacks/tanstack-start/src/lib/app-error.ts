/** One error vocabulary for every layer. `status` is used only where a real HTTP response exists. */
export const ERROR_STATUS = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
} as const
export type ErrorCode = keyof typeof ERROR_STATUS

/** The wire shape of a failure. `message` is safe to show: never a stack, SQL or a secret. */
export interface ApiProblem {
  code: ErrorCode
  message: string
  /** `validation` only: messages per input field. */
  fields?: Record<string, string[]>
}

/** Every server function returns this envelope. Expected failures are data, not exceptions. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiProblem }

/** Thrown by services (server) and by the client call helper (browser). Same codes on both sides. */
export class AppError extends Error {
  override readonly name = 'AppError'
  readonly code: ErrorCode
  readonly fields: Record<string, string[]> | undefined

  constructor(code: ErrorCode, message: string, fields?: Record<string, string[]>) {
    super(message)
    this.code = code
    this.fields = fields
  }

  toProblem(): ApiProblem {
    return this.fields
      ? { code: this.code, message: this.message, fields: this.fields }
      : { code: this.code, message: this.message }
  }
}

export const unauthenticated = (): ApiResult<never> => ({
  ok: false,
  error: { code: 'unauthenticated', message: 'Sign in to continue.' },
})

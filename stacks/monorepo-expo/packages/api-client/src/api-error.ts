import { ERROR_STATUS, type ErrorCode } from '@repo/contracts'

/**
 * What every client call throws. Same codes as the server envelope, so a screen switches on
 * `code` and shows `message` (always safe to show). `status` is the HTTP status, when there was one.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly code: ErrorCode
  readonly fields: Record<string, string[]> | undefined
  readonly status: number | undefined

  constructor(code: ErrorCode, message: string, fields?: Record<string, string[]>, status?: number) {
    super(message)
    this.code = code
    this.fields = fields
    this.status = status
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

const codeByStatus = new Map<number, ErrorCode>(
  Object.entries(ERROR_STATUS).map(([code, status]) => [status, code as ErrorCode]),
)

/** For a response with no envelope (a proxy's 502 page, a crashed edge): the code its status implies. */
export const codeForStatus = (status: number): ErrorCode =>
  codeByStatus.get(status) ?? (status >= 500 ? 'unavailable' : 'internal')

import { AppError, ERROR_STATUS, type ApiProblem, type ApiResult } from './app-error'

const isProblem = (value: unknown): value is ApiProblem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiProblem).message === 'string' &&
  Object.hasOwn(ERROR_STATUS, (value as ApiProblem).code)

const isResult = (value: unknown): value is ApiResult<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean'

/**
 * Client side: turn the envelope into a value or a thrown AppError (what TanStack Query wants).
 * Always an AppError with a safe message, whatever went wrong:
 * - an envelope from the server function → its data, or its error;
 * - a guard's answer before the function ran (413, 429; src/server/request-guards.ts) → its error;
 * - offline, Worker down → `unavailable`; anything unrecognisable → `internal`. Aborts pass through.
 */
export async function call<T>(send: () => Promise<ApiResult<T>>): Promise<T> {
  let result: unknown
  try {
    result = await send()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (isProblem(error)) throw new AppError(error.code, error.message, error.fields)
    throw new AppError('unavailable', 'Could not reach the server. Check your connection.')
  }
  if (!isResult(result)) throw new AppError('internal', 'Something went wrong. Try again.')
  if (result.ok) return result.data as T
  throw new AppError(result.error.code, result.error.message, result.error.fields)
}

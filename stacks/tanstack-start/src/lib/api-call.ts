import { AppError, type ApiResult } from './app-error'

/**
 * Client side: turn the envelope into a value or a thrown AppError (what TanStack Query wants).
 * A transport failure (offline, Worker down) becomes `unavailable`. Aborts pass through.
 */
export async function call<T>(send: () => Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>
  try {
    result = await send()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AppError('unavailable', 'Could not reach the server. Check your connection.')
  }
  if (result.ok) return result.data
  throw new AppError(result.error.code, result.error.message, result.error.fields)
}

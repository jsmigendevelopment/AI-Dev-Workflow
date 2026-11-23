import { createSerializationAdapter } from '@tanstack/react-router'
import { AppError, type ErrorCode } from './app-error'

/**
 * Keeps an AppError an AppError when the server hands it to the browser (a query error rendered
 * on the server, then hydrated). Without it the error arrives as a plain Error with no `code`,
 * the view picks a different branch than the server did, and React reports a hydration mismatch.
 */
export const appErrorAdapter = createSerializationAdapter({
  key: 'app-error',
  test: (value): value is AppError => value instanceof AppError,
  toSerializable: (error) => ({ code: error.code, message: error.message, fields: error.fields ?? null }),
  fromSerializable: (v: { code: ErrorCode; message: string; fields: Record<string, string[]> | null }) =>
    new AppError(v.code, v.message, v.fields ?? undefined),
})

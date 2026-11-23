import { isApiError } from '@repo/api-client'

/** A message that is always safe to show: the server's own (already safe) or a generic one. */
export function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : 'Something went wrong. Try again.'
}

/** A field's first message from a `validation` error, if the server sent one. */
export function fieldError(error: unknown, field: string): string | undefined {
  return isApiError(error) && error.code === 'validation' ? error.fields?.[field]?.[0] : undefined
}

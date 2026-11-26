/** The one list of error codes. Add one here and give it a message in copy.ts. */
export const ERROR_CODES = [
  'validation_failed',
  'not_found',
  'engine_unavailable',
  'data_unreadable',
  'unexpected',
] as const

/** One of the error codes. */
export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * `REF-` and the last six characters of the request ID. A UUIDv7 starts with the time, so its first
 * characters barely change between requests; its last ones are random. Searching the logs for those
 * six characters finds the request's lines.
 */
export function referenceIdFor(requestId: string): string {
  return `REF-${requestId.slice(-6)}`
}

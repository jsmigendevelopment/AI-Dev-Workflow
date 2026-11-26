import type { Result } from '@app/contract/envelope'
import { errorResult } from '@app/contract/envelope'
import type { ErrorCode } from '@app/contract/errors'

/** An expected failure a service throws; the engine answers the command with its code. */
export class EngineError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
    this.name = 'EngineError'
  }
}

/** The failed result for an error a command threw: its own code if expected, else `unexpected`. */
export function failureResult(requestId: string, error: unknown): Result<never> {
  return errorResult(requestId, error instanceof EngineError ? error.code : 'unexpected')
}

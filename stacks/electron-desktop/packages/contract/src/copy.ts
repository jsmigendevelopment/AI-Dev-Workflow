import type { ErrorCode } from './errors.ts'

/** One plain message per error code: what happened and what to do next. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  validation_failed:
    'The app refused a request it did not expect. Restart the app; if it keeps happening, send the reference ID.',
  not_found: 'That item is no longer there. Refresh the list.',
  engine_unavailable: 'The app’s engine is not running. Restart the app.',
  data_unreadable:
    'The app could not read its data file. Restart the app; if it keeps happening, send the reference ID.',
  unexpected: 'Something unexpected went wrong. Try again; if it keeps happening, send the reference ID.',
}

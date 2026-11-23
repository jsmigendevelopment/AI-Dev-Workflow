import { AppError } from '@/lib/app-error'

/** One transactional email. `html` and `text` are already rendered by a template. */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /**
   * Stable per logical email, e.g. `welcome/<user id>`. The provider answers a repeated key with
   * the first result, so a retry or a double submit never sends twice.
   */
  idempotencyKey: string
  replyTo?: string
  /** Letters, digits, `_` and `-` only. Lets delivery webhooks find the row that caused the email. */
  tags?: Record<string, string>
}

/** The port a service depends on. Adapters: Resend (src/server), memory (tests), disabled (no key). */
export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>
}

/** Used when no key is set: every send fails closed with a code the UI can show. */
export const disabledEmailSender: EmailSender = {
  send: () => Promise.reject(new AppError('unavailable', 'Email is not set up yet.')),
}

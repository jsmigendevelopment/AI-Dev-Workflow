import type { EmailMessage, EmailSender } from '@/lib/email/email'

const ENDPOINT = 'https://api.resend.com/emails'
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [500, 1500]
const MAX_RETRY_AFTER_MS = 5000

export interface ResendConfig {
  apiKey: string
  /** A verified sender, e.g. `Acme <hello@mail.example.com>`. */
  from: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/**
 * The Resend adapter: one `fetch` to the REST API (the SDK adds ~169 KiB to the Worker for this).
 * Retries only 429 and 5xx, with the same Idempotency-Key, so a retry can never send twice.
 * Never retries other 4xx (our bug) or a network error (Resend may already have it).
 */
export function resendEmailSender({
  apiKey,
  from,
  fetch: send = (...args) => fetch(...args),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: ResendConfig): EmailSender {
  return {
    async send(message: EmailMessage) {
      const body = JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo && { reply_to: message.replyTo }),
        ...(message.tags && { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) }),
      })
      for (let attempt = 1; ; attempt++) {
        const response = await send(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
            // Resend answers 403 without a User-Agent, and Workers fetch sends none.
            'User-Agent': 'app-worker/1',
          },
          body,
        })
        if (response.ok) {
          const data = await response.json<{ id?: unknown }>()
          if (typeof data.id !== 'string') throw new Error('Resend returned no email id')
          return { id: data.id }
        }
        const retryable = response.status === 429 || response.status >= 500
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          // The status and Resend's error name go to the Worker log; never the key or the email body.
          const detail = await response.text().catch(() => '')
          throw new Error(`Resend send failed: ${response.status} ${detail.slice(0, 200)}`)
        }
        await sleep(retryDelay(response, attempt))
      }
    },
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_RETRY_AFTER_MS)
  return BACKOFF_MS[attempt - 1] ?? MAX_RETRY_AFTER_MS
}

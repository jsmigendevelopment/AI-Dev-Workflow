import type { EmailMessage, EmailSender } from './email'

/** The test fake. Like the real provider, a repeated idempotency key returns the first id and sends nothing. */
export function memoryEmailSender() {
  const outbox: EmailMessage[] = []
  const ids = new Map<string, string>()
  const sender: EmailSender = {
    async send(message) {
      const seen = ids.get(message.idempotencyKey)
      if (seen) return { id: seen }
      const id = `email_${outbox.length + 1}`
      ids.set(message.idempotencyKey, id)
      outbox.push({ ...message })
      return { id }
    },
  }
  return { sender, outbox }
}

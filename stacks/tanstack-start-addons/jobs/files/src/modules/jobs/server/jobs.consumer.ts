import { jobMessage } from '../schemas'
import type { JobsService } from './jobs.service'

/** The slice of a Cloudflare Queues message we use, so this runs in Node tests. */
export interface QueueMessage {
  readonly body: unknown
  readonly attempts: number
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

export interface Log {
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** 30 s, 60 s, 120 s, ... capped at 15 minutes. */
export const backoffSeconds = (attempts: number) => Math.min(900, 30 * 2 ** Math.max(0, attempts - 1))

/**
 * The queue's controller: parse each message, run it, then ack or retry it. Messages are handled
 * one by one and acked individually, so one bad message never makes the whole batch redeliver.
 * A message that can never succeed (bad shape, unknown type) is acked and logged, not retried.
 */
export async function consumeBatch(messages: readonly QueueMessage[], jobs: JobsService, log: Log = console) {
  for (const message of messages) {
    const parsed = jobMessage.safeParse(message.body)
    if (!parsed.success) {
      log.warn('job: dropped a message that is not a job')
      message.ack()
      continue
    }
    try {
      const outcome = await jobs.run(parsed.data)
      if (outcome === 'busy') message.retry({ delaySeconds: 60 })
      else {
        if (outcome === 'unknown') log.warn('job: no handler for type', parsed.data.type)
        message.ack()
      }
    } catch (error) {
      log.error('job failed', parsed.data.type, parsed.data.id, error)
      message.retry({ delaySeconds: backoffSeconds(message.attempts) })
    }
  }
}

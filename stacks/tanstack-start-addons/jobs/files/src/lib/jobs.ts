/**
 * A background job: a small, serializable message. `id` must be stable for one logical piece of
 * work (e.g. `send-receipt/<order id>`), because that is what makes a redelivery a no-op.
 */
export interface Job {
  id: string
  type: string
  payload?: Record<string, string | number | boolean | null>
}

/** The producer port a service depends on. The Queues adapter lives in src/server. */
export interface JobQueue {
  send(job: Job, options?: { delaySeconds?: number }): Promise<void>
}

/** The test fake: records what was enqueued. */
export function memoryJobQueue() {
  const sent: Job[] = []
  const queue: JobQueue = {
    async send(job) {
      sent.push(structuredClone(job))
    },
  }
  return { queue, sent }
}

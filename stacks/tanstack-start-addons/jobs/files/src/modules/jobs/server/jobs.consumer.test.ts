import { describe, expect, it, vi } from 'vitest'
import { backoffSeconds, consumeBatch, type QueueMessage } from './jobs.consumer'
import { memoryJobsRepository } from './jobs.repository.memory'
import { createJobsService } from './jobs.service'

function message(body: unknown, attempts = 1) {
  const m = { body, attempts, ack: vi.fn(), retry: vi.fn() }
  return m satisfies QueueMessage
}
const log = { warn: vi.fn(), error: vi.fn() }

function service(work: () => Promise<void>) {
  return createJobsService({ repo: memoryJobsRepository(), now: () => 1, handlers: { ping: work } })
}

describe('queue consumer', () => {
  it('runs a job once when the same message is delivered twice in one batch', async () => {
    const work = vi.fn(async () => {})
    const a = message({ id: 'ping/1', type: 'ping' })
    const b = message({ id: 'ping/1', type: 'ping' })
    await consumeBatch([a, b], service(work), log)
    expect(work).toHaveBeenCalledTimes(1)
    expect(a.ack).toHaveBeenCalled()
    expect(b.ack).toHaveBeenCalled()
  })

  it('retries a failed job with backoff and acks the rest of the batch', async () => {
    const work = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('boom'))
    work.mockResolvedValue(undefined)
    const failing = message({ id: 'ping/1', type: 'ping' }, 3)
    const fine = message({ id: 'ping/2', type: 'ping' })
    await consumeBatch([failing, fine], service(work), log)
    expect(failing.retry).toHaveBeenCalledWith({ delaySeconds: 120 })
    expect(failing.ack).not.toHaveBeenCalled()
    expect(fine.ack).toHaveBeenCalled()
  })

  it('acks and logs a message that is not a job, or has unknown fields, instead of retrying forever', async () => {
    const bad = [
      message('hello'),
      message({ id: 'x', type: 'ping', extra: 1 }),
      message({ id: '', type: 'ping' }),
    ]
    await consumeBatch(
      bad,
      service(async () => {}),
      log,
    )
    for (const m of bad) {
      expect(m.ack).toHaveBeenCalled()
      expect(m.retry).not.toHaveBeenCalled()
    }
  })

  it('acks an unknown type', async () => {
    const m = message({ id: 'x', type: 'nope' })
    await consumeBatch(
      [m],
      service(async () => {}),
      log,
    )
    expect(m.ack).toHaveBeenCalled()
  })

  it('backs off 30 s, 60 s, 120 s … up to 15 minutes', () => {
    expect([1, 2, 3, 10].map(backoffSeconds)).toEqual([30, 60, 120, 900])
  })
})

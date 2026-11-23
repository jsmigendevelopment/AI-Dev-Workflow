import { describe, expect, it, vi } from 'vitest'
import { memoryJobsRepository } from './jobs.repository.memory'
import { createJobsService, PRUNE_JOB } from './jobs.service'

const job = { id: 'send-receipt/order_1', type: 'send-receipt' }

function setup(work = vi.fn(async () => {})) {
  let clock = 1_000_000
  const repo = memoryJobsRepository()
  const service = createJobsService({
    repo,
    now: () => clock,
    handlers: { 'send-receipt': work },
    staleAfterMs: 1000,
    keepFinishedMs: 5000,
  })
  return { service, repo, work, tick: (ms: number) => (clock += ms) }
}

describe('jobs service: at most one successful run per job id', () => {
  it('runs a job once, and a redelivery is a duplicate that does no work', async () => {
    const { service, work } = setup()
    expect(await service.run(job)).toBe('done')
    expect(await service.run(job)).toBe('duplicate')
    expect(await service.run({ ...job, payload: { different: true } })).toBe('duplicate')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the work throws, so the retry runs it again', async () => {
    const work = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('provider down'))
    work.mockResolvedValue(undefined)
    const { service } = setup(work)
    await expect(service.run(job)).rejects.toThrow('provider down')
    expect(await service.run(job)).toBe('done')
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('says busy while another Worker holds a fresh claim, and takes over a stale one', async () => {
    const { service, repo, work, tick } = setup()
    await repo.claim(job.id, job.type, 1_000_000, 0) // another Worker started it
    expect(await service.run(job)).toBe('busy')
    expect(work).not.toHaveBeenCalled()
    tick(1001) // that Worker died: the claim is now stale
    expect(await service.run(job)).toBe('done')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('reports an unknown type without claiming it', async () => {
    const { service } = setup()
    expect(await service.run({ id: 'x', type: 'nobody-handles-this' })).toBe('unknown')
  })

  it('the built-in prune job forgets old finished runs, so ids can be reused only after the window', async () => {
    const { service, tick } = setup()
    await service.run(job)
    tick(6000)
    expect(await service.run({ id: 'cron/prune/1', type: PRUNE_JOB })).toBe('done')
    expect(await service.run(job)).toBe('done') // its ledger row was pruned
  })
})

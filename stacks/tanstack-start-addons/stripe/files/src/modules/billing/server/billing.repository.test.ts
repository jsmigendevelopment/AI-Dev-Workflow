import { readdirSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { createDb } from '@/db/client'
import type { BillingRepository, SubscriptionState } from './billing.repository'
import { drizzleBillingRepository } from './billing.repository.drizzle'
import { memoryBillingRepository } from './billing.repository.memory'

const state = (status: SubscriptionState['status']): SubscriptionState => ({
  subscriptionId: 'sub_1',
  status,
  priceId: 'price_pro',
  currentPeriodEnd: 9000,
})

function contract(name: string, make: () => Promise<BillingRepository>) {
  describe(`billing repository contract: ${name}`, () => {
    it('links a customer once per owner and keeps the first link', async () => {
      const repo = await make()
      expect(await repo.findByOwner('ann')).toBeNull()
      expect((await repo.linkCustomer('ann', 'cus_1', 10)).customerId).toBe('cus_1')
      expect((await repo.linkCustomer('ann', 'cus_2', 11)).customerId).toBe('cus_1')
      expect(await repo.findByOwner('ann')).toMatchObject({
        ownerId: 'ann',
        customerId: 'cus_1',
        status: 'none',
      })
    })

    it('applies subscription changes in event order only', async () => {
      const repo = await make()
      await repo.linkCustomer('ann', 'cus_1', 10)
      expect(await repo.applySubscription('cus_1', state('active'), 200, 20)).toBe(true)
      expect(await repo.applySubscription('cus_1', state('past_due'), 100, 21)).toBe(false)
      expect(await repo.applySubscription('cus_1', state('canceled'), 200, 22)).toBe(true)
      expect(await repo.applySubscription('cus_unknown', state('active'), 300, 23)).toBe(false)
      expect(await repo.findByOwner('ann')).toMatchObject({
        status: 'canceled',
        lastEventAt: 200,
        currentPeriodEnd: 9000,
      })
    })

    it('records events idempotently', async () => {
      const repo = await make()
      expect(await repo.hasEvent('evt_1')).toBe(false)
      await repo.recordEvent('evt_1', 'invoice.paid', 1)
      await repo.recordEvent('evt_1', 'invoice.paid', 2)
      expect(await repo.hasEvent('evt_1')).toBe(true)
    })
  })
}

contract('memory', async () => memoryBillingRepository())

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>
beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false })
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const statement of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) await proxy.env.DB.prepare(statement).run()
}, 30_000)
afterAll(() => proxy?.dispose())

contract('d1', async () => {
  await proxy.env.DB.batch([
    proxy.env.DB.prepare('DELETE FROM billing_customers'),
    proxy.env.DB.prepare('DELETE FROM billing_events'),
  ])
  return drizzleBillingRepository(createDb(proxy.env.DB))
})

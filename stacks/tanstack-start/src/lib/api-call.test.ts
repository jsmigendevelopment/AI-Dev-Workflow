import { describe, expect, it } from 'vitest'
import { call } from './api-call'
import { AppError } from './app-error'

const fails = async (send: () => Promise<never>) => {
  try {
    await call(send)
  } catch (error) {
    return error as AppError
  }
  throw new Error('expected a failure')
}

describe('call', () => {
  it('returns the data of a successful envelope', async () => {
    expect(await call(async () => ({ ok: true, data: 5 }))).toBe(5)
  })

  it('throws the envelope error as an AppError', async () => {
    const error = await fails(
      async () => ({ ok: false, error: { code: 'not_found', message: 'Gone.' } }) as never,
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('not_found')
  })

  it("turns a guard's refusal (thrown by Start's client as the error object) into its code", async () => {
    const error = await fails(() => Promise.reject({ code: 'rate_limited', message: 'Too many requests.' }))
    expect([error.code, error.message]).toEqual(['rate_limited', 'Too many requests.'])
  })

  it('never shows a raw error: transport failures are unavailable, junk is internal', async () => {
    const offline = await fails(() => Promise.reject(new TypeError('Failed to fetch')))
    expect([offline.code, offline.message]).toEqual([
      'unavailable',
      'Could not reach the server. Check your connection.',
    ])
    const junk = await fails(async () => undefined as never)
    expect([junk.code, junk.message]).toEqual(['internal', 'Something went wrong. Try again.'])
    const fake = await fails(() => Promise.reject({ code: 'stack_trace', message: 'at db.ts:12' }))
    expect(fake.code).toBe('unavailable')
  })
})

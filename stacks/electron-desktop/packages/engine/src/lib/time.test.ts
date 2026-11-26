import { describe, expect, it } from 'vitest'

import { systemClock } from './time.ts'

describe('systemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now()
    const now = systemClock().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })
})

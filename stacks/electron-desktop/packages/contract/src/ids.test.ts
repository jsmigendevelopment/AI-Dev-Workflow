import { describe, expect, it } from 'vitest'

import { newId } from './ids.ts'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  it('WHEN ids.ts makes IDs one after another THEN each is a UUIDv7 and they sort in creation order', () => {
    const ids = Array.from({ length: 1000 }, () => newId())
    for (const id of ids) expect(id).toMatch(UUID_V7)
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

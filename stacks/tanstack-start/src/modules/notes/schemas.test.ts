import { describe, expect, it } from 'vitest'

import { ERROR_STATUS } from '@/lib/app-error'

import { createNoteInput, listNotesInput, renameNoteBody } from './schemas'

// The same cases as the /api/v1 contract's own tests (monorepo pack, packages/contracts), so the
// standalone web pack can't drift from it without a failing test.
describe('notes schemas match the /api/v1 contract', () => {
  it('trims a title, rejects an empty one with the shared message, caps it at 200', () => {
    expect(createNoteInput.parse({ title: '  Milk  ' })).toEqual({ title: 'Milk' })
    expect(createNoteInput.safeParse({ title: '   ' }).error?.issues[0]?.message).toBe(
      'Give the note a title.',
    )
    expect(createNoteInput.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(createNoteInput.safeParse({ title: 'x'.repeat(200) }).success).toBe(true)
  })

  it('rejects unknown fields instead of dropping them', () => {
    expect(createNoteInput.safeParse({ title: 'a', ownerId: 'u1' }).success).toBe(false)
    expect(renameNoteBody.safeParse({ title: 'a', id: 'x' }).success).toBe(false)
    expect(listNotesInput.safeParse({ limit: '5', sort: 'desc' }).success).toBe(false)
  })

  it('coerces the query-string limit, defaults it to 20 and caps it at 100', () => {
    expect(listNotesInput.parse({})).toEqual({ limit: 20 })
    expect(listNotesInput.parse({ limit: '5', cursor: 'abc' })).toEqual({ limit: 5, cursor: 'abc' })
    for (const limit of ['101', '0', '2.5'])
      expect(listNotesInput.safeParse({ limit }).success, limit).toBe(false)
    expect(listNotesInput.safeParse({ cursor: '' }).success).toBe(false)
  })

  it('uses the contract’s error codes and statuses', () => {
    expect(ERROR_STATUS).toEqual({
      validation: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      too_large: 413,
      rate_limited: 429,
      internal: 500,
      unavailable: 503,
    })
  })
})

import { describe, expect, it } from 'vitest'

import { ERROR_STATUS } from '@/lib/app-error'

import { browseNotesInput, createNoteInput, getNoteInput, listNotesInput, renameNoteBody } from './schemas'
import { parseNoteParams, parseNotesSearch } from './search'

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

/** What the router hands the parser: whatever the URL holds. */
const parseUrl = (raw: Record<string, unknown>) =>
  parseNotesSearch(raw as Parameters<typeof parseNotesSearch>[0])

describe('the /notes URL and the app-only list input', () => {
  it('fills defaults and falls back on bad values instead of failing the page', () => {
    expect(parseUrl({})).toEqual({ sort: 'newest', page: 1 })
    expect(parseUrl({ q: ' milk ', sort: 'oldest', page: '3' })).toEqual({
      q: 'milk',
      sort: 'oldest',
      page: 3,
    })
    expect(parseUrl({ q: 'x'.repeat(101), sort: 'title', page: '99' })).toEqual({
      q: undefined,
      sort: 'newest',
      page: 1,
    })
    expect(parseUrl({ page: '-1' }).page).toBe(1)
  })

  it('browses with q and sort, but keeps the rest of the contract strict', () => {
    expect(browseNotesInput.parse({ q: 'a', sort: 'oldest' })).toEqual({ q: 'a', sort: 'oldest', limit: 20 })
    expect(browseNotesInput.parse({})).toEqual({ sort: 'newest', limit: 20 })
    expect(browseNotesInput.safeParse({ sort: 'title' }).success).toBe(false)
    expect(browseNotesInput.safeParse({ ownerId: 'u1' }).success).toBe(false)
  })

  it('takes a UUID as a note id and nothing else', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(parseNoteParams({ noteId: id })).toEqual({ noteId: id })
    for (const noteId of ['1', 'abc', `${id}x`, '00000000-0000-4000-8000-00000000000g'])
      expect(parseNoteParams({ noteId })).toBe(false)
    // The route's check and the server's schema agree on what an id is.
    expect(getNoteInput.safeParse({ id }).success).toBe(true)
  })
})

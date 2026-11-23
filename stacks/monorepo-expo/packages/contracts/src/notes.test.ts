import { describe, expect, it } from 'vitest'
import { createNoteBody, listNotesQuery, noteDto, notesPage, renameNoteBody } from './notes'

describe('notes contract', () => {
  it('trims a title and rejects an empty one with the shared message', () => {
    expect(createNoteBody.parse({ title: '  Milk  ' })).toEqual({ title: 'Milk' })
    const result = createNoteBody.safeParse({ title: '   ' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Give the note a title.')
  })

  it('rejects a title over 200 characters', () => {
    expect(createNoteBody.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(createNoteBody.safeParse({ title: 'x'.repeat(200) }).success).toBe(true)
  })

  it('rejects unknown fields instead of dropping them', () => {
    expect(createNoteBody.safeParse({ title: 'a', ownerId: 'u1' }).success).toBe(false)
    expect(renameNoteBody.safeParse({ title: 'a', id: 'x' }).success).toBe(false)
    expect(listNotesQuery.safeParse({ limit: '5', sort: 'desc' }).success).toBe(false)
  })

  it('coerces the query-string limit, defaults it to 20 and caps it at 100', () => {
    expect(listNotesQuery.parse({})).toEqual({ limit: 20 })
    expect(listNotesQuery.parse({ limit: '5', cursor: 'abc' })).toEqual({ limit: 5, cursor: 'abc' })
    expect(listNotesQuery.safeParse({ limit: '101' }).success).toBe(false)
    expect(listNotesQuery.safeParse({ limit: '0' }).success).toBe(false)
    expect(listNotesQuery.safeParse({ limit: '2.5' }).success).toBe(false)
  })

  it('parses a page and refuses a note without its fields', () => {
    const note = { id: 'n1', title: 'a', createdAt: 1, updatedAt: 1 }
    expect(notesPage.parse({ items: [note], nextCursor: null })).toEqual({ items: [note], nextCursor: null })
    expect(noteDto.safeParse({ id: 'n1', title: 'a' }).success).toBe(false)
  })
})

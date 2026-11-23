import type { ListOptions, NoteRow, NotesRepository } from './notes.repository'

// Like SQLite's lower(): ASCII letters only, so the fake matches what D1 matches.
const fold = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase())

/** Newest first: createdAt, then id, both descending. */
const newestFirst = (a: NoteRow, b: NoteRow) =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

const isAfter = (r: NoteRow, after: NonNullable<ListOptions['after']>, order: ListOptions['order']) =>
  order === 'oldest'
    ? r.createdAt > after.createdAt || (r.createdAt === after.createdAt && r.id > after.id)
    : r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.id)

/** The test fake. It passes the same contract suite as the D1 adapter, so service tests can trust it. */
export function memoryNotesRepository(seed: NoteRow[] = []): NotesRepository {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]))
  const mine = (ownerId: string, id: string) => {
    const row = rows.get(id)
    return row && row.ownerId === ownerId ? row : null
  }
  return {
    async listByOwner(ownerId, { after, limit, q, order = 'newest' }) {
      const sorted = [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .filter((r) => !after || isAfter(r, after, order))
        .filter((r) => !q || fold(r.title).includes(fold(q)))
        .sort(newestFirst)
      return (order === 'oldest' ? sorted.reverse() : sorted).slice(0, limit).map((r) => ({ ...r }))
    },
    async findByOwner(ownerId, id) {
      const row = mine(ownerId, id)
      return row ? { ...row } : null
    },
    async insert(row) {
      if (rows.has(row.id)) throw new Error('UNIQUE constraint failed: notes.id')
      rows.set(row.id, { ...row })
    },
    async rename(ownerId, id, title, updatedAt) {
      const row = mine(ownerId, id)
      if (!row) return null
      Object.assign(row, { title, updatedAt })
      return { ...row }
    },
    async delete(ownerId, id) {
      if (!mine(ownerId, id)) return false
      rows.delete(id)
      return true
    },
  }
}

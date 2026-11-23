import type { NoteRow, NotesRepository } from './notes.repository'

/** The test fake. It passes the same contract suite as the D1 adapter, so service tests can trust it. */
export function memoryNotesRepository(seed: NoteRow[] = []): NotesRepository {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]))
  const mine = (ownerId: string, id: string) => {
    const row = rows.get(id)
    return row && row.ownerId === ownerId ? row : null
  }
  return {
    async listByOwner(ownerId, { after, limit }) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .filter(
          (r) =>
            !after || r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .slice(0, limit)
        .map((r) => ({ ...r }))
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

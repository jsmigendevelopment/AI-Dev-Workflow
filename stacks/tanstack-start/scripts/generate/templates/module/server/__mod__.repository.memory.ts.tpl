import type { __Plural__Repository, __Single__Row } from './__mod__.repository'

const newestFirst = (a: __Single__Row, b: __Single__Row) =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

/** The test fake. It passes the same contract suite as the database adapter. */
export function memory__Plural__Repository(seed: __Single__Row[] = []): __Plural__Repository {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]))
  return {
    async listByOwner(ownerId, limit) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .sort(newestFirst)
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
    async insert(row) {
      if (rows.has(row.id)) throw new Error('UNIQUE constraint failed: __table__.id')
      rows.set(row.id, { ...row })
    },
    async delete(ownerId, id) {
      if (rows.get(id)?.ownerId !== ownerId) return false
      return rows.delete(id)
    },
  }
}

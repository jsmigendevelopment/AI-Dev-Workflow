import type { FileRow, FilesRepository } from './files.repository'

/** The test fake. Passes the same contract suite as the D1 adapter. */
export function memoryFilesRepository(seed: FileRow[] = []): FilesRepository {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]))
  const mine = (ownerId: string, id: string) => {
    const row = rows.get(id)
    return row && row.ownerId === ownerId ? row : null
  }
  return {
    async insertPending(row) {
      const existing = rows.get(row.id)
      if (existing) return { ...existing }
      rows.set(row.id, { ...row })
      return { ...row }
    },
    async findOwned(ownerId, id) {
      const row = mine(ownerId, id)
      return row ? { ...row } : null
    },
    async markReady(ownerId, id, updatedAt) {
      const row = mine(ownerId, id)
      if (!row || row.status !== 'pending') return false
      Object.assign(row, { status: 'ready', updatedAt })
      return true
    },
    async listReady(ownerId, { after, limit }) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId && r.status === 'ready')
        .filter(
          (r) =>
            !after || r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
    async delete(ownerId, id) {
      const row = mine(ownerId, id)
      if (!row) return null
      rows.delete(id)
      return { ...row }
    },
    async listStalePending(before, limit) {
      return [...rows.values()]
        .filter((r) => r.status === 'pending' && r.createdAt < before)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
    async deletePending(id) {
      if (rows.get(id)?.status !== 'pending') return false
      rows.delete(id)
      return true
    },
  }
}

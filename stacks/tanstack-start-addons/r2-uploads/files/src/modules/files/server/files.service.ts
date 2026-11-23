import type { Actor } from '@/lib/actor'
import { AppError } from '@/lib/app-error'
import { decodeCursor, encodeCursor, type Page } from '@/lib/page'
import type { FileDto, FileType, UploadTicket } from '../types'
import type { FileRow, FilesRepository } from './files.repository'
import type { FileStore, StoredObject } from './files.store'

export interface FilesDeps {
  repo: FilesRepository
  store: FileStore
  now: () => number
}

const toDto = (row: FileRow): FileDto => ({
  id: row.id,
  name: row.name,
  type: row.type,
  size: row.size,
  status: row.status,
  createdAt: row.createdAt,
})

// Someone else's file is "not found", never "forbidden".
const missing = () => new AppError('not_found', 'That file does not exist.')

/**
 * Business rules for uploads. The row is written before the bytes (D1 and R2 can't share a
 * transaction): pending → store.put → ready. A crash in between leaves a pending row that
 * `sweep` removes, never a ready row without bytes.
 */
export function createFilesService({ repo, store, now }: FilesDeps) {
  return {
    async createUpload(
      actor: Actor,
      input: { id: string; name: string; type: FileType; size: number },
    ): Promise<UploadTicket> {
      const at = now()
      const row = await repo.insertPending({
        ...input,
        ownerId: actor.userId,
        key: `${actor.userId}/${input.id}`,
        status: 'pending',
        createdAt: at,
        updatedAt: at,
      })
      // The same request again (a retry) gets the same ticket. Anything else with this id is refused.
      const same =
        row.ownerId === actor.userId &&
        row.status === 'pending' &&
        row.name === input.name &&
        row.type === input.type &&
        row.size === input.size
      if (!same) throw new AppError('conflict', 'That upload id is already used.')
      return { id: row.id, uploadUrl: `/api/files/${row.id}` }
    },

    async upload(
      actor: Actor,
      id: string,
      body: ReadableStream<Uint8Array>,
      sent: { contentType: string; size: number },
    ): Promise<FileDto> {
      const row = await repo.findOwned(actor.userId, id)
      if (!row) throw missing()
      if (row.status === 'ready') throw new AppError('conflict', 'That file is already uploaded.')
      if (sent.contentType !== row.type || sent.size !== row.size)
        throw new AppError('validation', 'The upload doesn’t match what was declared.', {
          _: ['Send the same file type and size you declared.'],
        })
      await store.put(row.key, body, { contentType: row.type, size: row.size })
      if (!(await repo.markReady(actor.userId, id, now()))) throw missing() // deleted mid-upload
      return toDto({ ...row, status: 'ready' })
    },

    async download(actor: Actor, id: string): Promise<{ file: FileDto; object: StoredObject }> {
      const row = await repo.findOwned(actor.userId, id)
      if (!row || row.status !== 'ready') throw missing()
      const object = await store.get(row.key)
      if (!object) throw missing()
      return { file: toDto(row), object }
    },

    async list(actor: Actor, input: { cursor?: string | undefined; limit: number }): Promise<Page<FileDto>> {
      const after = decodeCursor(input.cursor)
      if (after === undefined)
        throw new AppError('validation', 'That page link is not valid.', { cursor: ['Not a valid cursor.'] })
      const rows = await repo.listReady(actor.userId, { after, limit: input.limit + 1 })
      const items = rows.slice(0, input.limit)
      const last = items.at(-1)
      return {
        items: items.map(toDto),
        nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
      }
    },

    /** Bytes first, then the row: a failure leaves a row to retry the delete with, never orphaned bytes. */
    async remove(actor: Actor, input: { id: string }): Promise<{ id: string }> {
      const row = await repo.findOwned(actor.userId, input.id)
      if (!row) throw missing()
      await store.delete(row.key)
      await repo.delete(actor.userId, input.id)
      return { id: input.id }
    },

    /** Removes uploads still pending after `maxAgeMs`, and their bytes. Run it from a cron job. */
    async sweep(maxAgeMs = 60 * 60 * 1000, batch = 100): Promise<number> {
      let removed = 0
      for (const row of await repo.listStalePending(now() - maxAgeMs, batch)) {
        await store.delete(row.key)
        if (await repo.deletePending(row.id)) removed++
      }
      return removed
    },
  }
}

export type FilesService = ReturnType<typeof createFilesService>

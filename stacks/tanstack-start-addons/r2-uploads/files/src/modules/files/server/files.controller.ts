import type { Actor } from '@/lib/actor'
import { respond } from '@/lib/respond'
import { createUploadInput, deleteFileInput, listFilesInput } from '../schemas'
import type { FilesService } from './files.service'

/** Raw input in, envelope out, for the server functions. Bytes go through files.http.ts instead. */
export const filesController = (service: FilesService) => ({
  createUpload: (actor: Actor, raw: unknown) =>
    respond(createUploadInput, raw, (input) => service.createUpload(actor, input)),
  list: (actor: Actor, raw: unknown) => respond(listFilesInput, raw, (input) => service.list(actor, input)),
  remove: (actor: Actor, raw: unknown) =>
    respond(deleteFileInput, raw, (input) => service.remove(actor, input)),
})

export type FilesController = ReturnType<typeof filesController>

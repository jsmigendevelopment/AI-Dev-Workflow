import type { Actor } from '@/lib/actor'
import { respond } from '@/lib/respond'

import {
  browseNotesInput,
  createNoteInput,
  deleteNoteInput,
  getNoteInput,
  listNotesInput,
  renameNoteInput,
} from '../schemas'
import type { NotesService } from './notes.service'

/**
 * Raw input in, envelope out: validate with the module's schema, call one service method.
 * Plain functions, so they are contract-tested in Node without a Worker runtime.
 */
export const notesController = (service: NotesService) => ({
  /** The /api/v1 list: the shared contract, cursor and limit only. */
  list: (actor: Actor, raw: unknown) => respond(listNotesInput, raw, (input) => service.list(actor, input)),
  /** This app's list page: the same paging plus `q` and `sort`. */
  browse: (actor: Actor, raw: unknown) =>
    respond(browseNotesInput, raw, (input) => service.list(actor, input)),
  get: (actor: Actor, raw: unknown) => respond(getNoteInput, raw, (input) => service.get(actor, input)),
  create: (actor: Actor, raw: unknown) =>
    respond(createNoteInput, raw, (input) => service.create(actor, input)),
  rename: (actor: Actor, raw: unknown) =>
    respond(renameNoteInput, raw, (input) => service.rename(actor, input)),
  remove: (actor: Actor, raw: unknown) =>
    respond(deleteNoteInput, raw, (input) => service.remove(actor, input)),
})

export type NotesController = ReturnType<typeof notesController>

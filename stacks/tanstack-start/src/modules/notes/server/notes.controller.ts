import type { Actor } from '@/lib/actor'
import { respond } from '@/lib/respond'

import { createNoteInput, deleteNoteInput, listNotesInput, renameNoteInput } from '../schemas'
import type { NotesService } from './notes.service'

/**
 * Raw input in, envelope out: validate with the module's schema, call one service method.
 * Plain functions, so they are contract-tested in Node without a Worker runtime.
 */
export const notesController = (service: NotesService) => ({
  list: (actor: Actor, raw: unknown) => respond(listNotesInput, raw, (input) => service.list(actor, input)),
  create: (actor: Actor, raw: unknown) =>
    respond(createNoteInput, raw, (input) => service.create(actor, input)),
  rename: (actor: Actor, raw: unknown) =>
    respond(renameNoteInput, raw, (input) => service.rename(actor, input)),
  remove: (actor: Actor, raw: unknown) =>
    respond(deleteNoteInput, raw, (input) => service.remove(actor, input)),
})

export type NotesController = ReturnType<typeof notesController>

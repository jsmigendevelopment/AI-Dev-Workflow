import { createServerFn } from '@tanstack/react-start'

import { asActor, withActor } from '@/server/auth'
import { notesApi } from '@/server/composition'
import { asHuman, withHumanCheck } from '@/server/turnstile'

import type {
  BrowseNotesInput,
  CreateNoteInput,
  DeleteNoteInput,
  GetNoteInput,
  RenameNoteInput,
} from '../types'

// The route table: method, auth middleware, a typed pass-through validator, one controller call.
// The validator only types `data` for callers; the controller does the real parsing, so bad
// input comes back as a `validation` envelope with field messages instead of a thrown error.
// No logic here: this file is imported by client code and cannot be unit-tested.

export const listNotes = createServerFn({ method: 'GET' })
  .middleware([withActor])
  .validator((data: BrowseNotesInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => notesApi().browse(actor, data)))

export const getNote = createServerFn({ method: 'GET' })
  .middleware([withActor])
  .validator((data: GetNoteInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => notesApi().get(actor, data)))

// The public-facing write: Turnstile-checked when TURNSTILE_* keys are set, a pass-through when not.
export const createNote = createServerFn({ method: 'POST' })
  .middleware([withActor, withHumanCheck])
  .validator((data: CreateNoteInput): unknown => data)
  .handler(({ data, context }) =>
    asActor(context.actor, (actor) => asHuman(context.human, () => notesApi().create(actor, data))),
  )

export const renameNote = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: RenameNoteInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => notesApi().rename(actor, data)))

export const deleteNote = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: DeleteNoteInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => notesApi().remove(actor, data)))

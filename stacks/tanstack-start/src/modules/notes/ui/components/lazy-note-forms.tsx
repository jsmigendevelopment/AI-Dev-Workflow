import { lazy, Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import type { NoteDto } from '@/modules/notes/types'

// The note forms carry TanStack Form and classic Zod (the client-side title check), about 30 KB
// gzip. They load in their own chunk after the page, so the list and a note's page don't pay for
// them up front; the server checks every write with the full schema either way.
const NoteCreateForm = lazy(() => import('./note-create-form').then((m) => ({ default: m.NoteCreateForm })))
const NoteRenameForm = lazy(() => import('./note-rename-form').then((m) => ({ default: m.NoteRenameForm })))

/** The add form's shape (label, field and button) while its code loads, so nothing moves. */
function CreateFormSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Loading the note form…</span>
      <Skeleton className="h-5 w-28" />
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-14" />
      </div>
    </div>
  )
}

/** The rename row's shape (field, Save, Cancel) while its code loads. */
function RenameFormSkeleton() {
  return (
    <div aria-busy="true" className="flex gap-2">
      <span className="sr-only">Loading the rename form…</span>
      <Skeleton className="h-9 flex-1" />
      <Skeleton className="h-8 w-14" />
      <Skeleton className="h-8 w-16" />
    </div>
  )
}

export function LazyNoteCreateForm() {
  return (
    <Suspense fallback={<CreateFormSkeleton />}>
      <NoteCreateForm />
    </Suspense>
  )
}

export function LazyNoteRenameForm(props: { note: NoteDto; onDone: () => void }) {
  return (
    <Suspense fallback={<RenameFormSkeleton />}>
      <NoteRenameForm {...props} />
    </Suspense>
  )
}

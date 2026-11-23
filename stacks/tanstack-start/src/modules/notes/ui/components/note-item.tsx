import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useDeleteNote } from '@/modules/notes/hooks/use-notes'
import type { NoteDto } from '@/modules/notes/types'

import { LazyNoteRenameForm } from './lazy-note-forms'

/** One row: the title links to the note's page; rename and delete apply at once (optimistic). */
export function NoteItem({ note }: { note: NoteDto }) {
  const remove = useDeleteNote()
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <li className="py-2">
        <LazyNoteRenameForm note={note} onDone={() => setEditing(false)} />
      </li>
    )

  return (
    <li className="flex items-center gap-2 py-2">
      <Link
        to="/notes/$noteId"
        params={{ noteId: note.id }}
        className="flex-1 truncate underline-offset-4 hover:underline"
      >
        {note.title}
      </Link>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Rename
      </Button>
      <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: note.id })}>
        Delete
      </Button>
    </li>
  )
}

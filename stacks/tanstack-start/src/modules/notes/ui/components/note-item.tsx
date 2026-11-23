import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDeleteNote, useRenameNote } from '../../hooks/use-notes'
import type { NoteDto } from '../../types'

export function NoteItem({ note }: { note: NoteDto }) {
  const rename = useRenameNote()
  const remove = useDeleteNote()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title)

  function save(event: FormEvent) {
    event.preventDefault()
    rename.mutate({ id: note.id, title }, { onSuccess: () => setEditing(false) })
  }

  if (editing)
    return (
      <li className="py-2">
        <form onSubmit={save} className="flex gap-2">
          <Input aria-label="Note title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Button type="submit" size="sm" disabled={rename.isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
        {rename.error ? (
          <p className="text-destructive mt-1 text-sm">
            {rename.error.fields?.title?.[0] ?? rename.error.message}
          </p>
        ) : null}
      </li>
    )

  return (
    <li className="flex items-center gap-2 py-2">
      <span className="flex-1 truncate">{note.title}</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Rename
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: note.id })}
      >
        Delete
      </Button>
    </li>
  )
}

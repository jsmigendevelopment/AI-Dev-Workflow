import { useForm } from '@tanstack/react-form'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRenameNote } from '@/modules/notes/hooks/use-notes'
import { noteTitle } from '@/modules/notes/schemas'
import type { NoteDto } from '@/modules/notes/types'

import { FieldError } from './field-error'

const checkTitle = ({ value }: { value: string }) => noteTitle.safeParse(value).error?.issues[0]?.message

/**
 * Rename in place. A valid title closes the form at once and shows the new title (optimistic);
 * if the server refuses, the old title comes back and the error toast says why.
 */
export function NoteRenameForm({ note, onDone }: { note: NoteDto; onDone: () => void }) {
  const rename = useRenameNote()
  const id = useId()
  const form = useForm({
    defaultValues: { title: note.title },
    onSubmit: ({ value }) => {
      rename.mutate({ id: note.id, title: value.title })
      onDone()
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-1"
    >
      <form.Field name="title" validators={{ onSubmit: checkTitle }}>
        {(field) => {
          const error = field.state.meta.errors.find(Boolean)
          return (
            <>
              <div className="flex gap-2">
                <Input
                  aria-label="Note title"
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  autoFocus
                />
                <Button type="submit" size="sm">
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onDone}>
                  Cancel
                </Button>
              </div>
              <FieldError id={`${id}-error`} message={error} />
            </>
          )
        }}
      </form.Field>
    </form>
  )
}

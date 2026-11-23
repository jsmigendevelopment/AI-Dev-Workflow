import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateNote } from '../../hooks/use-notes'
import { createNoteInput } from '../../schemas'

export function NoteCreateForm() {
  const create = useCreateNote()
  const [title, setTitle] = useState('')
  const [fieldError, setFieldError] = useState<string>()

  function submit(event: FormEvent) {
    event.preventDefault()
    // Same schema as the server, so the message matches what the server would say.
    const parsed = createNoteInput.safeParse({ title })
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message)
    setFieldError(undefined)
    create.mutate(parsed.data, {
      onSuccess: () => setTitle(''),
      onError: (error) => setFieldError(error.fields?.title?.[0] ?? error.message),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex gap-2">
        <Input
          aria-label="New note title"
          placeholder="Write a note title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'note-title-error' : undefined}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </div>
      {fieldError ? (
        <p id="note-title-error" className="text-destructive text-sm">
          {fieldError}
        </p>
      ) : null}
    </form>
  )
}

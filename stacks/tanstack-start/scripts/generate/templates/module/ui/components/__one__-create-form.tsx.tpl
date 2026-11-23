import { type FormEvent, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { __plural__Copy as copy } from '@/modules/__mod__/copy'

/**
 * The add form. Presentational: it keeps the draft title and hands it to `onCreate`; the section
 * runs the mutation. A field error is linked to the input (`aria-describedby`).
 */
export function __Single__CreateForm({
  pending,
  error,
  onCreate,
}: {
  pending: boolean
  error?: string | undefined
  onCreate: (title: string, done: () => void) => void
}) {
  const id = useId()
  const [title, setTitle] = useState('')
  const errorId = `${id}-error`

  function submit(event: FormEvent) {
    event.preventDefault()
    onCreate(title, () => setTitle(''))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={`${id}-title`} className="text-sm font-medium">
        {copy.newLabel}
      </label>
      <div className="flex gap-2">
        <Input
          id={`${id}-title`}
          name="title"
          required
          maxLength={200}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Button type="submit" disabled={pending}>
          {copy.add}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  )
}

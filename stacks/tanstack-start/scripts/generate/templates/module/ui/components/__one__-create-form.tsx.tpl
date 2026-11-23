import { useForm } from '@tanstack/react-form'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { __plural__Copy as copy } from '@/modules/__mod__/copy'

/**
 * The add form, on TanStack Form (the Form recipe). Presentational: it keeps the draft title and
 * hands it to `onCreate`; the section runs the mutation. A field error is linked to the input
 * (`aria-describedby`). Add client checks as field `validators` with the server's schema.
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
  const errorId = `${id}-error`
  const form = useForm({
    defaultValues: { title: '' },
    onSubmit: ({ value, formApi }) => onCreate(value.title, () => formApi.reset()),
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={`${id}-title`} className="text-sm font-medium">
        {copy.newLabel}
      </label>
      <div className="flex gap-2">
        <form.Field name="title">
          {(field) => (
            <Input
              id={`${id}-title`}
              name={field.name}
              required
              maxLength={200}
              autoComplete="off"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          )}
        </form.Field>
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

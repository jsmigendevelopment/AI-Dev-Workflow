import { type FormEvent, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTurnstile } from '@/hooks/use-turnstile'
import { useCreateNote } from '@/modules/notes/hooks/use-notes'
import { createNoteInput } from '@/modules/notes/schemas'

/**
 * The form error pattern: a visible label, the same schema as the server, and on a failed submit
 * the field gets `aria-invalid`, its message is linked with `aria-describedby`, and focus moves to
 * it. Form-level failures go into a `role="alert"` region that exists before it is filled.
 */
export function NoteCreateForm() {
  const create = useCreateNote()
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstile = useTurnstile(turnstileRef)
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string>()

  // Native validation stays on in the server HTML (no-JS path); the hydrated form takes over.
  useEffect(() => {
    if (formRef.current) formRef.current.noValidate = true
  }, [])

  function showFieldError(message: string | undefined) {
    setFieldError(message)
    inputRef.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(undefined)
    // Same schema as the server, so the message matches what the server would say.
    const parsed = createNoteInput.safeParse({ title })
    if (!parsed.success) return showFieldError(parsed.error.issues[0]?.message)
    setFieldError(undefined)
    const humanToken = await turnstile.token()
    create.mutate(
      { ...parsed.data, humanToken },
      {
        onSuccess: () => setTitle(''),
        onError: (error) => {
          const message = error.fields?.title?.[0]
          if (message) showFieldError(message)
          else setFormError(error.message)
        },
      },
    )
  }

  const errorId = `${id}-error`
  return (
    <form
      ref={formRef}
      onSubmit={(event) => void submit(event)}
      onFocus={() => void turnstile.prepare().catch(() => undefined)}
      className="flex flex-col gap-2"
    >
      <label htmlFor={`${id}-title`} className="text-sm font-medium">
        New note title
      </label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={`${id}-title`}
          name="title"
          required
          maxLength={200}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </div>
      {fieldError ? (
        <p id={errorId} className="text-destructive text-sm">
          {fieldError}
        </p>
      ) : null}
      <div role="alert" className="text-destructive text-sm empty:sr-only">
        {formError}
      </div>
      {turnstile.enabled ? <div ref={turnstileRef} /> : null}
    </form>
  )
}

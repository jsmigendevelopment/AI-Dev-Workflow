import { useForm } from '@tanstack/react-form'
import { type RefObject, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTurnstile } from '@/hooks/use-turnstile'
import { AppError } from '@/lib/app-error'
import { useCreateNote } from '@/modules/notes/hooks/use-notes'
import { noteTitle } from '@/modules/notes/schemas'

import { FieldError } from './field-error'

/** The same schema as the server, so the message matches what the server would say. */
const checkTitle = ({ value }: { value: string }) => noteTitle.safeParse(value).error?.issues[0]?.message

/** The form's state and submit: client check, Turnstile token, create, server errors placed. */
function useNoteCreateForm(
  formRef: RefObject<HTMLFormElement | null>,
  inputRef: RefObject<HTMLInputElement | null>,
  token: () => Promise<string | undefined>,
) {
  const create = useCreateNote()
  // Native validation stays on in the server HTML (no-JS path); the hydrated form takes over.
  useEffect(() => {
    if (formRef.current) formRef.current.noValidate = true
  }, [formRef])
  const [formError, setFormError] = useState<string>()
  const form = useForm({
    defaultValues: { title: '' },
    onSubmitInvalid: () => inputRef.current?.focus(),
    onSubmit: async ({ value, formApi }) => {
      setFormError(undefined)
      const humanToken = await token()
      try {
        await create.mutateAsync({ title: value.title, humanToken })
        formApi.reset()
      } catch (error) {
        const problem =
          error instanceof AppError ? error : new AppError('internal', 'Something went wrong. Try again.')
        const message = problem.fields?.title?.[0]
        if (!message) return setFormError(problem.message)
        formApi.setFieldMeta('title', (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: message },
        }))
        inputRef.current?.focus()
      }
    },
  })
  return { form, formError }
}

/**
 * The form error pattern, on TanStack Form (the Form recipe): a visible label, the same schema
 * as the server, and on a failed submit the field gets `aria-invalid`, its message is linked with
 * `aria-describedby`, and focus moves to it. A server field error lands on the same field.
 * Form-level failures go into a `role="alert"` region that exists before it is filled.
 */
export function NoteCreateForm() {
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstile = useTurnstile(turnstileRef)
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { form, formError } = useNoteCreateForm(formRef, inputRef, turnstile.token)

  const errorId = `${id}-error`
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      onFocus={() => void turnstile.prepare().catch(() => undefined)}
      className="flex flex-col gap-2"
    >
      <label htmlFor={`${id}-title`} className="text-sm font-medium">
        New note title
      </label>
      <form.Field name="title" validators={{ onSubmit: checkTitle }}>
        {(field) => {
          const fieldError = field.state.meta.errors.find(Boolean)
          return (
            <>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  id={`${id}-title`}
                  name={field.name}
                  required
                  maxLength={200}
                  autoComplete="off"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? errorId : undefined}
                />
                {/* Only the button re-renders while a submit runs: a granular subscription. */}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(submitting) => (
                    <Button type="submit" disabled={submitting}>
                      Add
                    </Button>
                  )}
                </form.Subscribe>
              </div>
              <FieldError id={errorId} message={fieldError} />
            </>
          )
        }}
      </form.Field>
      <div role="alert" className="text-destructive text-sm empty:sr-only">
        {formError}
      </div>
      {turnstile.enabled ? <div ref={turnstileRef} /> : null}
    </form>
  )
}

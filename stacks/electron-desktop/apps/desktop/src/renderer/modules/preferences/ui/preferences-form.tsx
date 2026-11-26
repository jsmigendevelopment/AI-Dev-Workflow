import type { Preferences } from '@app/contract/preferences'
import { preferencesSchema } from '@app/contract/preferences'
import { useForm } from '@tanstack/react-form'

import { Button } from '@/components/ui/button.tsx'

import { PREFERENCES_COPY } from '../copy.ts'
import { useSavePreferences } from '../hooks/use-preferences.ts'
import { NumberField } from './number-field.tsx'
import { SaveMessages } from './save-messages.tsx'

const FIELDS = [
  { name: 'pageSize', label: PREFERENCES_COPY.pageSizeLabel, unit: undefined },
  { name: 'refreshSeconds', label: PREFERENCES_COPY.refreshLabel, unit: PREFERENCES_COPY.seconds },
] as const

/**
 * The example form. The contract's own schema checks it here and again in main and the engine; a
 * refused value is never sent.
 */
export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const save = useSavePreferences()
  const form = useForm({
    defaultValues: preferences,
    validators: { onSubmit: preferencesSchema },
    // Settles either way: a refusal shows in the alert line from `save.error`, and the form stays busy
    // until the engine has answered, so a double press sends one request.
    onSubmit: ({ value }) =>
      new Promise<void>((resolve) => save.mutate(value, { onSettled: () => resolve() })),
    onSubmitInvalid: ({ formApi }) => {
      const invalid = FIELDS.find(({ name }) => formApi.getFieldMeta(name)?.errors.length)
      if (invalid) document.getElementById(`field-${invalid.name}`)?.focus()
    },
  })
  return (
    <form
      noValidate
      className="grid gap-4 rounded-r3 border border-line bg-surface p-6 shadow-hair"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <fieldset className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <legend className="float-left mr-8 min-h-10 content-center text-base font-semibold">
          {PREFERENCES_COPY.legend}
        </legend>
        {FIELDS.map(({ name, label, unit }) => (
          <form.Field key={name} name={name}>
            {(field) => <NumberField field={field} label={label} unit={unit} />}
          </form.Field>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-4">
        <SaveMessages error={save.error} isSuccess={save.isSuccess} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
              {isSubmitting ? PREFERENCES_COPY.saving : PREFERENCES_COPY.save}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

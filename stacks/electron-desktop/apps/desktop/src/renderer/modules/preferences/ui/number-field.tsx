import type { AnyFieldApi } from '@tanstack/react-form'

import { Input } from '@/components/ui/input.tsx'

/** The first message of a field's errors: a schema issue or a plain string. */
function firstError(errors: unknown[]): string | undefined {
  const [error] = errors
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return undefined
}

/**
 * One whole-number field: a visible label, the input and its unit. After a failed save its message is
 * linked with aria-describedby and the input is marked aria-invalid.
 */
export function NumberField({
  field,
  label,
  unit,
}: {
  field: AnyFieldApi
  label: string
  unit?: string | undefined
}) {
  const id = `field-${field.name}`
  const error = firstError(field.state.meta.errors)
  const value = field.state.value as number
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <Input
          id={id}
          name={field.name}
          type="number"
          inputMode="numeric"
          className="w-20"
          value={Number.isNaN(value) ? '' : value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.valueAsNumber)}
        />
        {unit && <span className="text-muted">{unit}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="max-w-60 text-xs font-semibold">
          {error}
        </p>
      )}
    </div>
  )
}

/** A field's message, linked from the input with `aria-describedby={id}`. Nothing when valid. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  ) : null
}

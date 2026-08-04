/**
 * Inline field-level error message.
 *
 * Rendered directly under its input and referenced by the input's `aria-describedby`
 * (see `useFormErrors().fieldProps`), so assistive tech announces the reason a field
 * was rejected instead of just "invalid".
 */
export default function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';

/**
 * Minimal form-error state shared by every form.
 *
 * Standard pattern: run field rules on submit, show the message inline under the field
 * (wired to the input via `aria-invalid` + `aria-describedby`), keep one form-level
 * message for submit/server failures, and map the API's field-level `details` back onto
 * the fields that caused them.
 *
 *   const f = useFormErrors<'email' | 'password'>();
 *   if (!f.validate({ email: rules.email(email) })) return;
 *   try { ... } catch (e) { f.setServerError(e, 'Could not sign in.'); }
 *   <input {...f.fieldProps('email')} />
 *   <FieldError id={f.errorId('email')} message={f.errors.email} />
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function useFormErrors<K extends string = string>(idPrefix = 'f') {
  const [errors, setErrors] = useState<FieldErrors<K>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const errorId = useCallback((field: K) => `${idPrefix}-${field}-error`, [idPrefix]);

  /** Set errors from a `{ field: message | undefined }` map. Returns true when valid. */
  const validate = useCallback((candidate: FieldErrors<K>) => {
    const next: FieldErrors<K> = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (v) next[k as K] = v as string;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError('Please fix the highlighted fields.');
      return false;
    }
    setFormError(null);
    return true;
  }, []);

  /** Clear one field's error (call on change so the message goes away as they fix it). */
  const clearError = useCallback((field: K) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setErrors({});
    setFormError(null);
  }, []);

  /**
   * Surface a failed request. Field-level `details` from the API land on their fields;
   * anything else becomes the form-level message.
   */
  const setServerError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      const details = err.details;
      if (Array.isArray(details)) {
        const mapped: FieldErrors<K> = {};
        for (const d of details as Array<{ path?: string; message?: string }>) {
          // The API sends dotted paths like "body.email" or "email".
          const field = d.path?.split('.').pop();
          if (field && d.message) mapped[field as K] = d.message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          setFormError(err.message || fallback);
          return;
        }
      }
      setFormError(err.message || fallback);
      return;
    }
    setFormError(fallback);
  }, []);

  /** Spread onto an input to wire up the accessible error state. */
  const fieldProps = useCallback(
    (field: K) =>
      errors[field]
        ? { 'aria-invalid': true as const, 'aria-describedby': errorId(field) }
        : {},
    [errors, errorId],
  );

  return {
    errors,
    formError,
    setFormError,
    validate,
    clearError,
    reset,
    setServerError,
    fieldProps,
    errorId,
  };
}

import { useEffect, useState } from 'react';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import { Input } from './ui/input';

/**
 * A password field with a show/hide toggle.
 *
 * Revealing the text is the accepted fix for the real problem with masked inputs: people
 * mistype, cannot see why, and fall back to shorter, simpler passwords. Letting them check
 * what they typed supports stronger ones.
 *
 * The toggle is a `type="button"` — inside a form, a bare <button> defaults to submit, so
 * peeking at the password would send the form.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  required,
  className = '',
  /** Hides the text again when this flips — used to re-mask after a successful save. */
  resetSignal,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  className?: string;
  resetSignal?: unknown;
} & Record<string, unknown>) {
  const [shown, setShown] = useState(false);

  // Never leave a password on screen after the form is done with it.
  useEffect(() => {
    setShown(false);
  }, [resetSignal]);

  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        required={required}
        // Room for the toggle so a long password never runs underneath it.
        className={`pr-10 ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        // The label carries the state, so screen readers hear it change without aria-pressed
        // — announcing both is redundant and reads as contradictory.
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-controls={id}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-600 transition hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:text-slate-300"
      >
        {shown ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
      </button>
    </div>
  );
}

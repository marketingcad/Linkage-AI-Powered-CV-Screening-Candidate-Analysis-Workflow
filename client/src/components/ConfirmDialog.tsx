import { useEffect, useState } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Alert } from './ui';

/**
 * Confirmation before something destructive.
 *
 * Replaces `window.confirm`, which the browser renders as a bare OS dialog: unstyled, not
 * translatable, impossible to say what is actually being deleted in, and on some browsers
 * suppressible entirely — so a "permanently delete" step could silently become a single click.
 *
 * For the worst actions pass `confirmPhrase`; the button stays disabled until the user types
 * it, which is the difference between confirming and reflexively hitting Enter.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirmPhrase,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** When set, the user must type this exactly before confirming. */
  confirmPhrase?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');

  // Clear the typed phrase between openings so a previous confirmation can't carry over and
  // leave the button already enabled.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const locked = confirmPhrase != null && typed.trim() !== confirmPhrase;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <LuTriangleAlert className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-display text-base font-semibold text-slate-900">
                {title}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-1 text-sm text-slate-600">{body}</div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {confirmPhrase != null && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">
              Type <span className="font-semibold text-slate-900">{confirmPhrase}</span> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder={confirmPhrase}
            />
          </label>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || locked}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-brand-500 hover:bg-brand-600'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

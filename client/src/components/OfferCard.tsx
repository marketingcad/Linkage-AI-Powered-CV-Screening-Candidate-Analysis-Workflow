import { useEffect, useState } from 'react';
import { LuHandshake, LuPencil, LuTriangleAlert } from 'react-icons/lu';
import { actOnOffer, fetchOffer, saveOffer } from '../api/endpoints';
import type { Offer, OfferAction, OfferStatus } from '../api/types';
import { Alert, Card } from './ui';

const STATUS_META: Record<OfferStatus, { label: string; cls: string; hint: string }> = {
  draft: {
    label: 'Draft',
    cls: 'bg-slate-100 text-slate-700',
    hint: 'Only your team can see this. The candidate has not been told.',
  },
  extended: {
    label: 'Extended',
    cls: 'bg-amber-100 text-amber-800',
    hint: 'Waiting on the candidate.',
  },
  accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800', hint: 'Offer signed.' },
  declined: { label: 'Declined', cls: 'bg-rose-100 text-rose-700', hint: 'The candidate said no.' },
  expired: {
    label: 'Expired',
    cls: 'bg-slate-100 text-slate-600',
    hint: 'The deadline passed without an answer.',
  },
  withdrawn: {
    label: 'Withdrawn',
    cls: 'bg-slate-100 text-slate-600',
    hint: 'We pulled this offer back.',
  },
};

/** Which buttons to show, mirroring the transitions the server will accept. */
const ACTIONS: Record<OfferStatus, OfferAction[]> = {
  draft: ['extend', 'withdraw'],
  extended: ['accept', 'decline', 'withdraw'],
  accepted: [],
  declined: [],
  expired: ['extend'],
  withdrawn: ['extend'],
};

const ACTION_LABELS: Record<OfferAction, string> = {
  extend: 'Extend offer',
  accept: 'Candidate accepted',
  decline: 'Candidate declined',
  withdraw: 'Withdraw',
};

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

/** ISO timestamp → the `yyyy-MM-dd` a date input expects. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Start dates and deadlines are calendar dates, stored as UTC midnight. Formatting them via
 * `new Date(iso)` would shift them a day back for anyone west of UTC — a 1 September start
 * would read "31 August" in New York — so they are formatted from the date parts instead.
 */
function dateOnly(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * Read a typed salary. Currency symbols, thousands separators and spaces are ignored, and the
 * "95k" shorthand is expanded — left to a bare digit strip, "95k" would silently become 95.
 * Anything else returns null so the caller can ask rather than guess.
 */
export function parseSalary(raw: string): { value: number | null } | { error: string } {
  const s = raw.trim().replace(/[\s,$£€¥]/g, '');
  if (s === '') return { value: null };
  const k = /^(\d+(?:\.\d+)?)k$/i.exec(s);
  if (k) return { value: Math.round(Number(k[1]) * 1000) };
  if (!/^\d+(?:\.\d+)?$/.test(s)) return { error: 'Enter the salary as a number, e.g. 95000.' };
  return { value: Math.round(Number(s)) };
}

function money(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      currency: currency ?? undefined,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown currency code — still show the number rather than nothing.
    return `${amount.toLocaleString()}${currency ? ` ${currency}` : ''}`;
  }
}

/**
 * The offer stage. Terms are drafted privately first, then extended, then answered — the same
 * three steps the server enforces, so the buttons never offer a move that will be rejected.
 */
export default function OfferCard({
  candidateId,
  canDraft,
  onStageChange,
}: {
  candidateId: string;
  /**
   * Whether an offer makes sense at this point in the pipeline. When false the card only
   * appears if an offer already exists — a brand-new applicant does not need a "Draft an
   * offer" button, but a rejected one who declined ours still needs the record visible.
   */
  canDraft: boolean;
  /** Fires after any action that moves the candidate, so the page header can re-render. */
  onStageChange: () => void;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Draft form fields.
  const [salary, setSalary] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  function hydrate(o: Offer | null) {
    setSalary(o?.salaryAmount != null ? String(o.salaryAmount) : '');
    setCurrency(o?.salaryCurrency ?? 'USD');
    setStartDate(toDateInput(o?.startDate ?? null));
    setExpiresAt(toDateInput(o?.expiresAt ?? null));
    setNotes(o?.notes ?? '');
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchOffer(candidateId)
      .then((res) => {
        if (!live) return;
        setOffer(res.offer);
        hydrate(res.offer);
      })
      .catch(() => live && setError('Could not load the offer.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [candidateId]);

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    const amount = parseSalary(salary);
    if ('error' in amount) {
      setError(amount.error);
      setBusy(false);
      return;
    }
    const code = currency.trim().toUpperCase();
    if (code !== '' && code.length !== 3) {
      setError('Use a three-letter currency code, e.g. USD.');
      setBusy(false);
      return;
    }
    try {
      const res = await saveOffer(candidateId, {
        salaryAmount: amount.value,
        salaryCurrency: code || null,
        startDate: startDate || null,
        expiresAt: expiresAt || null,
        notes: notes.trim() || null,
      });
      setOffer(res.offer);
      hydrate(res.offer);
      setEditing(false);
      setNote('Terms saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the terms.');
    } finally {
      setBusy(false);
    }
  }

  async function act(action: OfferAction, reason?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await actOnOffer(candidateId, action, reason);
      setOffer(res.offer);
      setDeclining(false);
      setDeclineReason('');
      onStageChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} the offer.`);
    } finally {
      setBusy(false);
    }
  }

  if (loading || (!offer && !canDraft)) return null;

  const meta = offer ? STATUS_META[offer.status] : null;
  // An answered offer is history — the server drafts a replacement rather than editing it, so
  // say so instead of letting "Edit terms" look like it will change what was sent.
  const answered = offer != null && ['accepted', 'declined'].includes(offer.status);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <LuHandshake className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-semibold text-slate-700">Offer</h2>
          {meta && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.cls}`}>
              {meta.label}
            </span>
          )}
        </div>
        {offer && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <LuPencil className="h-3.5 w-3.5" />
            {answered ? 'Draft a new offer' : 'Edit terms'}
          </button>
        )}
      </div>

      {!offer && !editing ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">No offer drafted yet.</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            Draft an offer
          </button>
        </div>
      ) : editing ? (
        <div className="space-y-3">
          {answered && (
            <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <LuTriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              Saving creates a new offer. The {STATUS_META[offer!.status].label.toLowerCase()} one stays on
              the record.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Base salary</span>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="95000"
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  aria-label="Currency code"
                  className={`${inputCls} w-16 text-center uppercase`}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Respond by</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Internal notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Approvals, equity, sign-on, anything the team should know."
              className={`${inputCls} resize-y`}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save terms'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                hydrate(offer);
                setEditing(false);
                setError(null);
              }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-slate-600">Base salary</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
                {money(offer!.salaryAmount, offer!.salaryCurrency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-600">Start date</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{dateOnly(offer!.startDate)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-600">Respond by</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{dateOnly(offer!.expiresAt)}</dd>
            </div>
          </dl>

          {offer!.notes && (
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {offer!.notes}
            </p>
          )}
          {offer!.declineReason && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Declined: {offer!.declineReason}
            </p>
          )}

          <p className="text-xs text-slate-600">{meta!.hint}</p>

          {declining ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Why did they decline?</span>
                <input
                  autoFocus
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Accepted another offer, compensation, location…"
                  className={`${inputCls} w-full`}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !declineReason.trim()}
                  onClick={() => act('decline', declineReason.trim())}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Record decline
                </button>
                <button
                  type="button"
                  onClick={() => setDeclining(false)}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            ACTIONS[offer!.status].length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {ACTIONS[offer!.status].map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    onClick={() => (a === 'decline' ? setDeclining(true) : act(a))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      a === 'extend'
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : a === 'accept'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      {note && (
        <div className="mt-3">
          <Alert kind="success">{note}</Alert>
        </div>
      )}
    </Card>
  );
}

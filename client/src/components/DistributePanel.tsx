import { useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { Job } from '../api/types';
import { Card } from './ui';

const PLATFORMS = [
  { key: 'indeed', label: 'Indeed' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'jobstreet', label: 'JobStreet' },
  { key: 'glassdoor', label: 'Glassdoor' },
];

function QrButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show QR code"
      className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      QR
    </button>
  );
}

function QrModal({
  url,
  label,
  jobTitle,
  onClose,
}: {
  url: string;
  label: string;
  jobTitle: string;
  onClose: () => void;
}) {
  function download() {
    const canvas = document.getElementById('distribute-qr-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${jobTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${label}_qr.png`;
    a.click();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">QR · {label}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">Scan to open the application page.</p>
        <div className="flex justify-center rounded-lg bg-white p-3">
          <QRCodeCanvas id="distribute-qr-canvas" value={url} size={220} level="M" marginSize={2} />
        </div>
        <p className="mt-3 break-all text-[11px] text-slate-400">{url}</p>
        <button
          type="button"
          onClick={download}
          className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

export default function DistributePanel({ job }: { job: Job }) {
  const [custom, setCustom] = useState('');
  const [qr, setQr] = useState<{ url: string; label: string } | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const linkFor = (src: string) =>
    `${origin}/apply/${job.id}${src ? `?src=${encodeURIComponent(src)}` : ''}`;

  const customSlug = custom
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const postingText = useMemo(() => {
    const lines = [
      job.title,
      [job.department, job.location, job.employmentType].filter(Boolean).join(' · '),
      '',
      job.description,
    ];
    if (job.requiredSkills.length) {
      lines.push('', `Key skills: ${job.requiredSkills.join(', ')}`);
    }
    lines.push('', `Apply here: ${linkFor('')}`);
    return lines.filter((l) => l !== undefined).join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-700">Distribute this job</h2>
      <p className="mt-1 text-xs text-slate-500">
        Paste these tracked links into each platform. Applicants who use them are tagged by source,
        so you can see which channel each candidate came from.
      </p>

      {job.status !== 'open' && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          This job is <b>{job.status}</b> — applicants can't submit until it's set to “open”.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {PLATFORMS.map((p) => (
          <div key={p.key} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{p.label}</span>
            <input
              readOnly
              value={linkFor(p.key)}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
            />
            <CopyButton text={linkFor(p.key)} />
            <QrButton onClick={() => setQr({ url: linkFor(p.key), label: p.label })} />
          </div>
        ))}

        {/* Custom source */}
        <div className="flex items-center gap-2 pt-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom source (e.g. company_newsletter)"
            className="w-40 shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-brand-500 focus:outline-none"
          />
          <input
            readOnly
            value={linkFor(customSlug)}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
          />
          <CopyButton text={linkFor(customSlug)} />
          <QrButton onClick={() => setQr({ url: linkFor(customSlug), label: customSlug || 'direct' })} />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ready-to-paste posting
          </span>
          <CopyButton text={postingText} />
        </div>
        <textarea
          readOnly
          value={postingText}
          rows={6}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        />
      </div>

      {qr && (
        <QrModal url={qr.url} label={qr.label} jobTitle={job.title} onClose={() => setQr(null)} />
      )}
    </Card>
  );
}
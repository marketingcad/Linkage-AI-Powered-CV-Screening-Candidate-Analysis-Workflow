import { useRef, useState } from 'react';
import {
  LuCircleCheck,
  LuCircleX,
  LuCloudUpload,
  LuFileText,
  LuLoaderCircle,
} from 'react-icons/lu';
import { importCv } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Alert, Button } from '../components/ui';
import * as v from '../lib/validators';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

type ItemStatus = 'queued' | 'processing' | 'done' | 'error';
interface Item {
  id: string;
  file: File;
  status: ItemStatus;
  name?: string;
  score?: number | null;
  message?: string;
}

const CONCURRENCY = 3;
/** Matches the CV upload limit enforced on the applicant form and the API. */
const MAX_MB = 10;
const ACCEPT_RE = /\.(pdf|docx)$/i;
let counter = 0;

/** Run each item through `worker`, at most `concurrency` at a time. */
async function runQueue<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]);
      }
    }),
  );
}

export default function ImportCvsDialog({
  jobId,
  onClose,
  onImported,
}: {
  jobId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Files we refused to queue, so a drop of 10 JPGs explains itself instead of doing nothing.
  const [rejected, setRejected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const queuedCount = items.filter((i) => i.status === 'queued').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const settled = items.length > 0 && !processing && queuedCount === 0;

  function patch(id: string, next: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const accepted: File[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files)) {
      // Same rules as the applicant form: type by extension, then size.
      const problem = v.fileRules(file, { maxMb: MAX_MB, accept: ACCEPT_RE, label: 'File' });
      if (problem) refused.push(`${file.name} — ${problem.replace(/^File /, '')}`);
      else accepted.push(file);
    }
    setRejected(refused);
    if (!accepted.length) return;
    setItems((prev) => [
      ...prev,
      ...accepted.map((file) => ({ id: `f${counter++}`, file, status: 'queued' as ItemStatus })),
    ]);
  }

  async function startImport() {
    const queued = items.filter((i) => i.status === 'queued');
    if (!queued.length) return;
    setProcessing(true);
    await runQueue(queued, CONCURRENCY, async (item) => {
      patch(item.id, { status: 'processing' });
      try {
        const { candidate } = await importCv(jobId, item.file);
        patch(item.id, {
          status: 'done',
          name: candidate.fullName,
          score: candidate.overallScore ?? candidate.qualificationScore ?? null,
        });
      } catch (err) {
        patch(item.id, {
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Import failed',
        });
      }
    });
    setProcessing(false);
    onImported();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !processing) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuCloudUpload className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="font-display text-lg font-semibold text-slate-900">
                Import CVs
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600">
                Upload PDF/DOCX files — each is parsed, AI-scored, and added to this job.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragging
                ? 'border-brand-400 bg-brand-50/60'
                : 'border-slate-300 bg-slate-50/50 hover:border-brand-300 hover:bg-brand-50/40'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <LuCloudUpload className="h-7 w-7 text-brand-500" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Drop CVs here, or click to browse
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              PDF or DOCX · up to {MAX_MB}&nbsp;MB each · multiple files supported
            </p>
          </div>

          {/* Files that never made it into the queue */}
          {rejected.length > 0 && (
            <Alert kind="error">
              <p className="font-medium">
                {rejected.length} file{rejected.length === 1 ? '' : 's'} skipped
              </p>
              <ul className="mt-1 space-y-0.5">
                {rejected.slice(0, 5).map((r, i) => (
                  <li key={i} className="truncate text-xs">
                    {r}
                  </li>
                ))}
                {rejected.length > 5 && (
                  <li className="text-xs">…and {rejected.length - 5} more.</li>
                )}
              </ul>
            </Alert>
          )}

          {/* File list */}
          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <StatusIcon status={it.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {it.name || it.file.name}
                    </p>
                    <p className="truncate text-xs text-slate-600">
                      {it.status === 'error'
                        ? it.message
                        : it.status === 'done'
                          ? `Added${it.score != null ? ` · score ${it.score}` : ''}`
                          : it.status === 'processing'
                            ? 'Analyzing…'
                            : it.file.name}
                    </p>
                  </div>
                  {it.status === 'done' && it.score != null && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {it.score}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-600">
            {items.length === 0
              ? 'No files selected'
              : settled
                ? `${doneCount} imported${errorCount ? ` · ${errorCount} failed` : ''}`
                : `${items.length} file${items.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={processing}>
              {settled ? 'Done' : 'Cancel'}
            </Button>
            <Button type="button" onClick={startImport} disabled={processing || queuedCount === 0}>
              {processing ? (
                <>
                  <LuLoaderCircle className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${queuedCount || ''} CV${queuedCount === 1 ? '' : 's'}`.replace('  ', ' ')
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'done') return <LuCircleCheck className="h-5 w-5 shrink-0 text-emerald-500" />;
  if (status === 'error') return <LuCircleX className="h-5 w-5 shrink-0 text-rose-500" />;
  if (status === 'processing')
    return <LuLoaderCircle className="h-5 w-5 shrink-0 animate-spin text-brand-500" />;
  return <LuFileText className="h-5 w-5 shrink-0 text-slate-600" />;
}

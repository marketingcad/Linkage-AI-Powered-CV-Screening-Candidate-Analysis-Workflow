import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  LuArrowLeft,
  LuBriefcase,
  LuBuilding2,
  LuCalendarDays,
  LuCircleCheck,
  LuClipboardList,
  LuClock,
  LuCloudUpload,
  LuSparkles,
  LuEllipsisVertical,
  LuFileText,
  LuGraduationCap,
  LuMapPin,
  LuPencil,
  LuPlus,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import { deleteJob, fetchCandidates, fetchJob } from '../api/endpoints';
import type { Candidate, CandidateSummary, Job } from '../api/types';
import { Alert, Button, Card, Skeleton, TableSkeleton } from '../components/ui';
import CandidateTable from '../components/CandidateTable';
import JobForm from '../components/JobForm';
import ImportCvsDialog from '../components/ImportCvsDialog';
import TalentPoolDialog from '../components/TalentPoolDialog';
import DistributePanel from '../components/DistributePanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  closed: { label: 'Closed', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<'details' | 'candidates'>('details');

  function load() {
    if (!id) return;
    setLoading(true);
    Promise.all([fetchJob(id), fetchCandidates({ jobId: id })])
      .then(([j, c]) => {
        setJob(j.job);
        setCandidates(c.candidates);
      })
      .catch(() => setError('Failed to load job.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function handleDelete() {
    if (!job) return;
    if (!confirm(`Delete "${job.title}" and all its candidates? This cannot be undone.`)) return;
    await deleteJob(job.id);
    navigate('/hr/jobs');
  }

  function handleSaved(updated: Job) {
    setEditing(false);
    setJob(updated);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-52 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
        <TableSkeleton rows={4} />
      </div>
    );
  }
  if (error || !job) return <Alert kind="error">{error ?? 'Job not found.'}</Alert>;

  const status = STATUS_META[job.status] ?? STATUS_META.draft;

  return (
    <div className="animate-rise space-y-6">
      <Link
        to="/hr/jobs"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <LuArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      {/* Header card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-[0_6px_16px_-6px_rgba(51,88,240,0.6)]">
              <LuBriefcase className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-semibold text-slate-900">{job.title}</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.department && (
                  <MetaChip Icon={LuBuilding2} text={job.department} tint="indigo" />
                )}
                {job.location && <MetaChip Icon={LuMapPin} text={job.location} tint="emerald" />}
                {job.employmentType && (
                  <MetaChip Icon={LuClock} text={job.employmentType} tint="amber" />
                )}
                <MetaChip
                  Icon={LuCalendarDays}
                  text={`Posted ${formatDate(job.createdAt)}`}
                  tint="slate"
                />
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Job actions"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 data-[state=open]:border-brand-300 data-[state=open]:bg-brand-50 data-[state=open]:text-brand-600"
              >
                <LuEllipsisVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <LuPencil className="text-slate-500" />
                Edit job
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete()}>
                <LuTrash2 />
                Delete job
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      {/* View toggle: Job details vs Ranked candidates */}
      <div
        role="tablist"
        aria-label="Job view"
        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'details'}
          onClick={() => setView('details')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === 'details'
              ? 'bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(51,88,240,0.6)]'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          <LuFileText className="h-4 w-4" />
          Job details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'candidates'}
          onClick={() => setView('candidates')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === 'candidates'
              ? 'bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(51,88,240,0.6)]'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          <LuUsers className="h-4 w-4" />
          Ranked candidates
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              view === 'candidates' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {candidates.length}
          </span>
        </button>
      </div>

      {view === 'details' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuFileText className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">About this role</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {job.description}
          </p>

          <div className="mt-6 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <SkillGroup
              title="Required skills"
              skills={job.requiredSkills}
              tone="required"
              Icon={LuCircleCheck}
            />
            <SkillGroup
              title="Nice to have"
              skills={job.niceToHaveSkills}
              tone="nice"
              Icon={LuPlus}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <LuClipboardList className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">Requirements</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <InfoRow
              Icon={LuBriefcase}
              label="Min. experience"
              value={job.minYearsExperience != null ? `${job.minYearsExperience} years` : 'Any'}
              tint="violet"
            />
            <InfoRow
              Icon={LuGraduationCap}
              label="Education"
              value={job.educationRequirement || 'Not specified'}
              tint="amber"
            />
            <InfoRow
              Icon={LuFileText}
              label="Screening exam"
              value={
                job.quiz.length
                  ? `${job.quiz.length} question${job.quiz.length === 1 ? '' : 's'}`
                  : 'None'
              }
              tint="sky"
            />
            <InfoRow
              Icon={LuCalendarDays}
              label="Posted"
              value={formatDate(job.createdAt)}
              tint="emerald"
            />
          </div>
        </Card>
          </div>

          <DistributePanel job={job} />
        </div>
      )}

      {view === 'candidates' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <LuUsers className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold text-slate-900">Ranked candidates</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {candidates.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setScanning(true)}>
                <LuSparkles className="h-4 w-4" />
                Scan talent pool
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                <LuCloudUpload className="h-4 w-4" />
                Import CVs
              </Button>
            </div>
          </div>
          <CandidateTable candidates={candidates as Candidate[]} />
        </div>
      )}

      {editing && <JobForm existing={job} onClose={() => setEditing(false)} onSaved={handleSaved} />}
      {importing && (
        <ImportCvsDialog
          jobId={job.id}
          onClose={() => setImporting(false)}
          onImported={load}
        />
      )}
      {scanning && (
        <TalentPoolDialog jobId={job.id} jobTitle={job.title} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}

// Colour tokens shared by chips + icon tiles on this page.
const CHIP_TINTS: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  brand: 'bg-brand-50 text-brand-700',
  slate: 'bg-slate-100 text-slate-600',
};

const TILE_TINTS: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
};

function MetaChip({ Icon, text, tint = 'slate' }: { Icon: IconType; text: string; tint?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${CHIP_TINTS[tint] ?? CHIP_TINTS.slate}`}
    >
      <Icon className="h-3.5 w-3.5 opacity-80" />
      {text}
    </span>
  );
}

function InfoRow({
  Icon,
  label,
  value,
  tint = 'slate',
}: {
  Icon: IconType;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TILE_TINTS[tint] ?? TILE_TINTS.slate}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function SkillGroup({
  title,
  skills,
  tone,
  Icon,
}: {
  title: string;
  skills: string[];
  tone: 'required' | 'nice';
  Icon: IconType;
}) {
  const chip =
    tone === 'required' ? 'bg-brand-50 text-brand-700' : 'bg-violet-50 text-violet-700';
  const iconCls = tone === 'required' ? 'text-emerald-500' : 'text-violet-500';
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
        {title}
      </p>
      {skills.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip}`}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

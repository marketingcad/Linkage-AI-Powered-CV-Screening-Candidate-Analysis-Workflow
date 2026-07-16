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
                {job.department && <MetaChip Icon={LuBuilding2} text={job.department} />}
                {job.location && <MetaChip Icon={LuMapPin} text={job.location} />}
                {job.employmentType && <MetaChip Icon={LuClock} text={job.employmentType} />}
                <MetaChip Icon={LuCalendarDays} text={`Posted ${formatDate(job.createdAt)}`} />
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <LuFileText className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-semibold text-slate-700">About this role</h2>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {job.description}
          </p>

          <div className="mt-6 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <SkillGroup
              title="Required skills"
              skills={job.requiredSkills}
              tone="brand"
              Icon={LuCircleCheck}
            />
            <SkillGroup
              title="Nice to have"
              skills={job.niceToHaveSkills}
              tone="slate"
              Icon={LuPlus}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <LuClipboardList className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-semibold text-slate-700">Requirements</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <InfoRow
              Icon={LuBriefcase}
              label="Min. experience"
              value={job.minYearsExperience != null ? `${job.minYearsExperience} years` : 'Any'}
            />
            <InfoRow
              Icon={LuGraduationCap}
              label="Education"
              value={job.educationRequirement || 'Not specified'}
            />
            <InfoRow
              Icon={LuFileText}
              label="Screening exam"
              value={
                job.quiz.length
                  ? `${job.quiz.length} question${job.quiz.length === 1 ? '' : 's'}`
                  : 'None'
              }
            />
            <InfoRow Icon={LuCalendarDays} label="Posted" value={formatDate(job.createdAt)} />
          </div>
        </Card>
      </div>

      <DistributePanel job={job} />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LuUsers className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Ranked candidates</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {candidates.length}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <LuCloudUpload className="h-4 w-4" />
            Import CVs
          </Button>
        </div>
        <CandidateTable candidates={candidates as Candidate[]} />
      </div>

      {editing && <JobForm existing={job} onClose={() => setEditing(false)} onSaved={handleSaved} />}
      {importing && (
        <ImportCvsDialog
          jobId={job.id}
          onClose={() => setImporting(false)}
          onImported={load}
        />
      )}
    </div>
  );
}

function MetaChip({ Icon, text }: { Icon: IconType; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {text}
    </span>
  );
}

function InfoRow({ Icon, label, value }: { Icon: IconType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="text-sm text-slate-700">{value}</p>
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
  tone: 'brand' | 'slate';
  Icon: IconType;
}) {
  const chip = tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600';
  const iconCls = tone === 'brand' ? 'text-brand-500' : 'text-slate-400';
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

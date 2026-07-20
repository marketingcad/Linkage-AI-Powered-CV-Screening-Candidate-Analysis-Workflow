import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  LuArrowRight,
  LuBan,
  LuBriefcase,
  LuBuilding2,
  LuCheck,
  LuCircleCheck,
  LuCopy,
  LuEllipsisVertical,
  LuMapPin,
  LuPencilLine,
  LuPlus,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import { deleteJob, duplicateJob, fetchJobs, updateJob } from '../api/endpoints';
import type { Job, JobStatus, JobSummary } from '../api/types';
import { Alert, Button, Card, Skeleton } from '../components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import JobForm from '../components/JobForm';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  closed: { label: 'Closed', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

// Availability options offered in the per-job actions menu.
const STATUS_OPTIONS: { value: JobStatus; label: string; hint: string; Icon: IconType; cls: string }[] = [
  { value: 'open', label: 'Available', hint: 'accepting applications', Icon: LuCircleCheck, cls: 'text-emerald-600' },
  { value: 'closed', label: 'Unavailable', hint: 'not accepting', Icon: LuBan, cls: 'text-rose-600' },
  { value: 'draft', label: 'Draft', hint: 'hidden from applicants', Icon: LuPencilLine, cls: 'text-slate-500' },
];

type SortKey = 'recent' | 'candidates' | 'title';
const STATUS_TABS: { value: '' | JobStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'draft', label: 'Draft' },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | JobStatus>('');
  const [sort, setSort] = useState<SortKey>('recent');
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    fetchJobs()
      .then((res) => setJobs(res.jobs))
      .catch(() => setError('Failed to load jobs.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleSaved(_job: Job) {
    setShowForm(false);
    load();
  }

  // Flip a position's availability (open/closed/draft) inline — optimistic update.
  async function changeStatus(job: JobSummary, status: JobStatus) {
    if (job.status === status) return;
    const prev = jobs;
    setError(null);
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, status } : j)));
    try {
      await updateJob(job.id, { status });
    } catch {
      setJobs(prev);
      setError('Could not update the job status. Please try again.');
    }
  }

  async function handleDelete(job: JobSummary) {
    if (!confirm(`Delete "${job.title}" and all its candidates? This cannot be undone.`)) return;
    const prev = jobs;
    setError(null);
    setJobs((js) => js.filter((j) => j.id !== job.id));
    try {
      await deleteJob(job.id);
    } catch {
      setJobs(prev);
      setError('Could not delete the job. Please try again.');
    }
  }

  async function handleDuplicate(job: JobSummary) {
    setError(null);
    try {
      await duplicateJob(job.id);
      load(); // the clone lands as a Draft
      setStatusFilter('draft');
    } catch {
      setError('Could not duplicate the job. Please try again.');
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': jobs.length, open: 0, closed: 0, draft: 0 };
    for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
    return c;
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const list = statusFilter ? jobs.filter((j) => j.status === statusFilter) : [...jobs];
    list.sort((a, b) => {
      if (sort === 'candidates') return b.candidateCount - a.candidateCount;
      if (sort === 'title') return a.title.localeCompare(b.title);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [jobs, statusFilter, sort]);

  return (
    <div className="animate-rise space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">Positions candidates are screened against.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <LuPlus className="h-4 w-4" />
          New job
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <LuBriefcase className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-700">No jobs yet</p>
          <p className="mt-1 text-xs text-slate-400">Create your first job to start receiving applications.</p>
          <Button className="mt-5" onClick={() => setShowForm(true)}>
            <LuPlus className="h-4 w-4" />
            New job
          </Button>
        </Card>
      ) : (
        <>
          {/* Filter + sort toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    statusFilter === tab.value
                      ? 'bg-brand-500 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      statusFilter === tab.value ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {counts[tab.value] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
            >
              <option value="recent">Newest</option>
              <option value="candidates">Most candidates</option>
              <option value="title">A–Z</option>
            </select>
          </div>

          {visibleJobs.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-600">No {statusFilter} jobs</p>
              <p className="mt-1 text-xs text-slate-400">Try a different filter.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleJobs.map((job) => {
            const status = STATUS_META[job.status] ?? STATUS_META.draft;
            return (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/hr/jobs/${job.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/hr/jobs/${job.id}`);
                  }
                }}
                className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-(--shadow-raised) focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{job.title}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Job actions"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-700"
                        >
                          <LuEllipsisVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuLabel>Availability</DropdownMenuLabel>
                        {STATUS_OPTIONS.map((opt) => {
                          const current = job.status === opt.value;
                          return (
                            <DropdownMenuItem
                              key={opt.value}
                              onSelect={() => void changeStatus(job, opt.value)}
                              className="gap-2"
                            >
                              <opt.Icon className={opt.cls} />
                              <span className="flex-1">
                                {opt.label}
                                <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                              </span>
                              {current && <LuCheck className="h-4 w-4 text-brand-600" />}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => navigate(`/hr/jobs/${job.id}`)}>
                          <LuArrowRight className="text-slate-500" />
                          Open & edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void handleDuplicate(job)}>
                          <LuCopy className="text-slate-500" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete(job)}>
                          <LuTrash2 />
                          Delete job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {job.department && (
                    <span className="inline-flex items-center gap-1">
                      <LuBuilding2 className="h-3.5 w-3.5" />
                      {job.department}
                    </span>
                  )}
                  {job.location && (
                    <span className="inline-flex items-center gap-1">
                      <LuMapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                  )}
                  {job.minYearsExperience != null && (
                    <span className="inline-flex items-center gap-1">
                      <LuBriefcase className="h-3.5 w-3.5" />
                      {job.minYearsExperience}+ yrs
                    </span>
                  )}
                </div>

                {job.requiredSkills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.requiredSkills.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {s}
                      </span>
                    ))}
                    {job.requiredSkills.length > 4 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                        +{job.requiredSkills.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <LuUsers className="h-4 w-4 text-slate-400" />
                    {job.candidateCount} candidate{job.candidateCount === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                    View
                    <LuArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            );
              })}
            </div>
          )}
        </>
      )}

      {showForm && <JobForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
    </div>
  );
}

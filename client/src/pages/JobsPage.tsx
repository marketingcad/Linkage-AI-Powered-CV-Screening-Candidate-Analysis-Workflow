import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuArrowRight, LuBriefcase, LuBuilding2, LuMapPin, LuPlus, LuUsers } from 'react-icons/lu';
import { fetchJobs } from '../api/endpoints';
import type { Job, JobSummary } from '../api/types';
import { Alert, Button, Card, Skeleton } from '../components/ui';
import JobForm from '../components/JobForm';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  closed: { label: 'Closed', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => {
            const status = STATUS_META[job.status] ?? STATUS_META.draft;
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => navigate(`/hr/jobs/${job.id}`)}
                className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-(--shadow-raised)"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{job.title}</h3>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
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
              </button>
            );
          })}
        </div>
      )}

      {showForm && <JobForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
    </div>
  );
}

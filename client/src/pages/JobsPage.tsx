import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJobs } from '../api/endpoints';
import type { Job, JobSummary } from '../api/types';
import { Alert, Card, Spinner } from '../components/ui';
import JobForm from '../components/JobForm';

const STATUS_CLS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-slate-100 text-slate-600',
  closed: 'bg-rose-100 text-rose-700',
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">Positions candidates are screened against.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          + New job
        </button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading jobs…" />
      ) : jobs.length === 0 ? (
        <Card className="p-12 text-center text-sm text-slate-400">
          No jobs yet. Create your first job to start receiving applications.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => navigate(`/hr/jobs/${job.id}`)}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{job.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[job.status] ?? ''}`}
                >
                  {job.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {[job.department, job.location].filter(Boolean).join(' · ') || '—'}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {job.candidateCount} candidate{job.candidateCount === 1 ? '' : 's'}
                </span>
                <span className="text-sm font-medium text-brand-600">View →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm && <JobForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
    </div>
  );
}

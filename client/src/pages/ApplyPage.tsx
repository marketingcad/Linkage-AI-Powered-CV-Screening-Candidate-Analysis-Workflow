import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicJobs } from '../api/endpoints';
import type { PublicJobListItem } from '../api/types';
import { Alert, Spinner } from '../components/ui';

export default function ApplyPage() {
  const [jobs, setJobs] = useState<PublicJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicJobs()
      .then((res) => setJobs(res.jobs))
      .catch(() => setLoadError('Could not load open positions. Is the API running?'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              CV
            </div>
            <span className="font-semibold text-slate-800">ScreenAI Careers</span>
          </div>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
            Recruiter login
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Open positions</h1>
          <p className="mt-2 text-slate-500">
            Pick a role to apply. Your CV is analyzed by AI and matched against the position in minutes.
          </p>
        </div>

        {loading ? (
          <Spinner label="Loading open positions…" />
        ) : loadError ? (
          <Alert kind="error">{loadError}</Alert>
        ) : jobs.length === 0 ? (
          <Alert kind="info">There are no open positions right now. Please check back later.</Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/apply/${job.id}`}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{job.title}</h3>
                  {job.quizCount > 0 && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Exam
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {[job.department, job.location, job.employmentType].filter(Boolean).join(' · ') || '—'}
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-600">{job.description}</p>
                <span className="mt-4 inline-block text-sm font-medium text-brand-600">Apply →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LuCheck } from 'react-icons/lu';
import PublicHeader from '../layout/PublicHeader';
import { fetchApplicationStatus } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { ApplicationStatus, CandidateStage } from '../api/types';
import { Alert, Card, Spinner, STAGE_ICONS } from '../components/ui';

const STEP_LABELS: Record<string, string> = {
  new: 'Under review',
  shortlisted: 'Shortlisted',
  interviewing: 'Interview',
  hired: 'Offer',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function StatusPage() {
  const { token } = useParams<{ token: string }>();
  const [app, setApp] = useState<ApplicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchApplicationStatus(token)
      .then((res) => setApp(res.application))
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'We could not find an application for this link. Please check the link from your email.'
            : 'Could not load your application status. Please try again later.',
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const rejected = app?.stage === 'rejected';
  const currentIndex = app ? app.timeline.indexOf(app.stage as CandidateStage) : -1;

  return (
    <div className="min-h-screen">
      <PublicHeader container="max-w-2xl" />

      <div className="mx-auto max-w-2xl px-6 py-10">
        {loading ? (
          <Spinner label="Loading your application status…" />
        ) : error ? (
          <Alert kind="error">{error}</Alert>
        ) : app ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Application status</h1>
              <p className="mt-1 text-slate-500">
                Hi {app.fullName}, here's the latest on your application
                {app.jobTitle ? (
                  <>
                    {' '}
                    for <span className="font-medium text-slate-700">{app.jobTitle}</span>
                  </>
                ) : null}
                .
              </p>
            </div>

            {/* Current status banner */}
            <Card
              className={`p-5 ${
                app.status.tone === 'positive'
                  ? 'border-emerald-200 bg-emerald-50'
                  : app.status.tone === 'negative'
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-brand-200 bg-brand-50'
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  app.status.tone === 'positive'
                    ? 'text-emerald-600'
                    : app.status.tone === 'negative'
                      ? 'text-rose-600'
                      : 'text-brand-600'
                }`}
              >
                Current status
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">{app.status.label}</p>
              <p className="mt-2 text-sm text-slate-600">{app.status.message}</p>
            </Card>

            {/* Timeline (hidden when rejected — that's a terminal state) */}
            {!rejected && (
              <Card className="p-6">
                <h2 className="mb-4 text-sm font-semibold text-slate-700">Progress</h2>
                <ol className="space-y-0">
                  {app.timeline.map((stage, i) => {
                    const done = i < currentIndex;
                    const current = i === currentIndex;
                    const last = i === app.timeline.length - 1;
                    return (
                      <li key={stage} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full ${
                              done
                                ? 'bg-emerald-500 text-white'
                                : current
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {done ? (
                              <LuCheck className="h-3.5 w-3.5" />
                            ) : (
                              (() => {
                                const Icon = STAGE_ICONS[stage];
                                return <Icon className="h-3.5 w-3.5" />;
                              })()
                            )}
                          </span>
                          {!last && (
                            <span
                              className={`my-1 w-0.5 flex-1 ${
                                i < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'
                              }`}
                              style={{ minHeight: 24 }}
                            />
                          )}
                        </div>
                        <div className={`pb-6 ${last ? 'pb-0' : ''}`}>
                          <p
                            className={`text-sm font-medium ${
                              current ? 'text-brand-700' : done ? 'text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            {STEP_LABELS[stage] ?? stage}
                          </p>
                          {current && (
                            <p className="text-xs text-slate-500">You are here</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            )}

            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>Submitted {fmtDate(app.submittedAt)}</span>
              <span>Last updated {fmtDate(app.updatedAt)}</span>
            </div>

            <p className="text-center text-xs text-slate-400">
              Bookmark this page to check back anytime. We'll also email you when your status changes.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

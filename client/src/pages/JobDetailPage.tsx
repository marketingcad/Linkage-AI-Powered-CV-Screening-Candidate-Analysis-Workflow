import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteJob, fetchCandidates, fetchJob } from '../api/endpoints';
import type { Candidate, CandidateSummary, Job } from '../api/types';
import { Alert, Card, Spinner } from '../components/ui';
import CandidateTable from '../components/CandidateTable';
import JobForm from '../components/JobForm';
import DistributePanel from '../components/DistributePanel';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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

  if (loading) return <Spinner label="Loading job…" />;
  if (error || !job) return <Alert kind="error">{error ?? 'Job not found.'}</Alert>;

  return (
    <div className="space-y-6">
      <Link to="/hr/jobs" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[job.department, job.location, job.employmentType].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{job.description}</p>
        </Card>
        <Card className="space-y-4 p-5">
          <Detail label="Status" value={job.status} />
          <Detail
            label="Min. experience"
            value={job.minYearsExperience != null ? `${job.minYearsExperience} years` : '—'}
          />
          <Detail label="Education" value={job.educationRequirement || '—'} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Required skills
            </p>
            <SkillList skills={job.requiredSkills} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nice to have
            </p>
            <SkillList skills={job.niceToHaveSkills} />
          </div>
          <Detail
            label="Screening exam"
            value={job.quiz.length ? `${job.quiz.length} question${job.quiz.length === 1 ? '' : 's'}` : 'None'}
          />
        </Card>
      </div>

      <DistributePanel job={job} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Ranked candidates ({candidates.length})
        </h2>
        <CandidateTable candidates={candidates as Candidate[]} />
      </div>

      {editing && <JobForm existing={job} onClose={() => setEditing(false)} onSaved={handleSaved} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm capitalize text-slate-700">{value}</p>
    </div>
  );
}

function SkillList({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <p className="mt-1 text-sm text-slate-400">—</p>;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          {s}
        </span>
      ))}
    </div>
  );
}

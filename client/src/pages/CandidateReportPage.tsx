import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuPrinter } from 'react-icons/lu';
import { fetchCandidate } from '../api/endpoints';
import type { Candidate, Job } from '../api/types';
import {
  AiWrittenBadge,
  Alert,
  Button,
  RecommendationBadge,
  ScoreRing,
  scoreBg,
  Spinner,
  StageBadge,
} from '../components/ui';

export default function CandidateReportPage() {
  const { id } = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCandidate(id)
      .then((res) => {
        setCandidate(res.candidate);
        setJob(res.job);
      })
      .catch(() => setError('Failed to load candidate.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-10"><Spinner label="Loading report…" /></div>;
  if (error || !candidate) return <div className="p-10"><Alert kind="error">{error ?? 'Not found.'}</Alert></div>;

  const c = candidate;
  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-6 print:hidden">
        <Link
          to={`/hr/candidates/${c.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <LuArrowLeft className="h-4 w-4" />
          Back to candidate
        </Link>
        <Button onClick={() => window.print()}>
          <LuPrinter className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Report sheet */}
      <div className="mx-auto max-w-3xl bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2.5">
            <img src="/Favicon_Linkage.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <div className="leading-none">
              <p className="font-display text-lg font-semibold text-slate-900">Linkage ScreenAI</p>
              <p className="mt-1 text-xs text-slate-400">Candidate screening report</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Generated {generated}</p>
        </div>

        {/* Candidate identity */}
        <div className="mt-6 flex items-start gap-5 break-inside-avoid">
          <ScoreRing score={c.overallScore ?? c.qualificationScore} size={72} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-slate-900">{c.fullName}</h1>
            <p className="text-sm text-slate-500">
              {c.email}
              {c.phone ? ` · ${c.phone}` : ''}
            </p>
            {job && <p className="mt-1 text-sm font-medium text-slate-600">Applying for: {job.title}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RecommendationBadge value={c.recommendation} />
              <StageBadge value={c.stage} />
              {c.aiLikelihood != null && <AiWrittenBadge likelihood={c.aiLikelihood} />}
            </div>
          </div>
        </div>

        {/* Scores */}
        <Section title="Scores">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ScoreTile label="Overall" value={c.overallScore} />
            <ScoreTile label="CV qualification" value={c.qualificationScore} />
            <ScoreTile label="Skills match" value={c.skillsMatchScore} />
            <ScoreTile label="Quiz / exam" value={c.quizScore} />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Total experience:{' '}
            <span className="font-medium text-slate-700">
              {c.totalYearsExperience != null ? `${c.totalYearsExperience} years` : '—'}
            </span>
          </p>
        </Section>

        {c.summary && (
          <Section title="AI summary">
            <p className="text-sm leading-relaxed text-slate-600">{c.summary}</p>
          </Section>
        )}

        {(c.strengths?.length || c.concerns?.length) && (
          <Section title="Assessment">
            <div className="grid gap-6 sm:grid-cols-2">
              <ReportList title="Strengths" items={c.strengths} marker="text-emerald-500" />
              <ReportList title="Concerns / gaps" items={c.concerns} marker="text-amber-500" />
            </div>
          </Section>
        )}

        {c.skillMatches && c.skillMatches.length > 0 && (
          <Section title="Skills match">
            <div className="space-y-1.5">
              {c.skillMatches.map((m) => (
                <div key={m.skill} className="flex items-start gap-2 text-sm">
                  <span className={m.matched ? 'text-emerald-600' : 'text-rose-500'}>
                    {m.matched ? '✓' : '✕'}
                  </span>
                  <div>
                    <span className="font-medium text-slate-700">{m.skill}</span>
                    {m.evidence && <span className="text-slate-500"> — {m.evidence}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {c.extractedExperience && c.extractedExperience.length > 0 && (
          <Section title="Experience">
            <div className="space-y-3">
              {c.extractedExperience.map((exp, i) => (
                <div key={i} className="break-inside-avoid border-l-2 border-slate-100 pl-3">
                  <p className="text-sm font-medium text-slate-800">
                    {exp.title} {exp.company ? `· ${exp.company}` : ''}
                  </p>
                  {(exp.startDate || exp.endDate) && (
                    <p className="text-xs text-slate-400">
                      {exp.startDate ?? '?'} – {exp.endDate ?? 'Present'}
                    </p>
                  )}
                  {exp.summary && <p className="mt-1 text-sm text-slate-600">{exp.summary}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {c.extractedEducation && c.extractedEducation.length > 0 && (
          <Section title="Education">
            <div className="space-y-2">
              {c.extractedEducation.map((ed, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-slate-800">{ed.institution}</p>
                  <p className="text-xs text-slate-500">
                    {[ed.degree, ed.field, ed.year].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {c.extractedCertifications && c.extractedCertifications.length > 0 && (
          <Section title="Certifications">
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
              {c.extractedCertifications.map((cert, i) => (
                <li key={i}>{cert}</li>
              ))}
            </ul>
          </Section>
        )}

        <p className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          Generated by Linkage ScreenAI · Confidential — for hiring evaluation only
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function ScoreTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-center">
      <span className={`inline-block rounded px-2 py-0.5 text-lg font-bold ${scoreBg(value)}`}>
        {value ?? '—'}
      </span>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function ReportList({
  title,
  items,
  marker,
}: {
  title: string;
  items: string[] | null;
  marker: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-700">{title}</p>
      {items && items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className={marker}>•</span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}

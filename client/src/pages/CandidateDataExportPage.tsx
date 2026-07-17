import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuDownload, LuPrinter } from 'react-icons/lu';
import { fetchCandidateExport } from '../api/endpoints';
import type { Candidate, Job } from '../api/types';
import { Alert, Button, Spinner } from '../components/ui';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function CandidateDataExportPage() {
  const { id } = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [exportedAt, setExportedAt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchCandidateExport(id)
      .then((res) => {
        setCandidate(res.candidate);
        setJob(res.job);
        setExportedAt(res.exportedAt);
      })
      .catch(() => setError('Failed to load the data export.'))
      .finally(() => setLoading(false));
  }, [id]);

  function downloadJson() {
    if (!candidate) return;
    const blob = new Blob([JSON.stringify({ candidate, job, exportedAt }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate-data-${candidate.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-10"><Spinner label="Preparing data export…" /></div>;
  if (error || !candidate)
    return <div className="p-10"><Alert kind="error">{error ?? 'Not found.'}</Alert></div>;

  const c = candidate;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2 px-6 print:hidden">
        <Link
          to={`/hr/candidates/${c.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <LuArrowLeft className="h-4 w-4" />
          Back to candidate
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadJson}>
            <LuDownload className="h-4 w-4" />
            Download JSON
          </Button>
          <Button onClick={() => window.print()}>
            <LuPrinter className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Sheet */}
      <div className="mx-auto max-w-3xl bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2.5">
            <img src="/Favicon_Linkage.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <div className="leading-none">
              <p className="font-display text-lg font-semibold text-slate-900">Linkage ScreenAI</p>
              <p className="mt-1 text-xs text-slate-400">Personal data export</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Generated {fmtDate(exportedAt)}</p>
        </div>

        <h1 className="mt-6 font-display text-2xl font-semibold text-slate-900">{c.fullName}</h1>
        <p className="text-sm text-slate-500">
          This document contains all personal data held about this candidate.
        </p>

        <Section title="Personal details">
          <Row label="Full name" value={c.fullName} />
          <Row label="Email" value={c.email} />
          <Row label="Phone" value={c.phone} />
          <Row label="Location" value={c.location} />
          <Row label="Current title" value={c.currentTitle} />
          <Row label="LinkedIn" value={c.linkedinUrl} />
          <Row label="Portfolio" value={c.portfolioUrl} />
          <Row label="Notice period" value={c.noticePeriod} />
          <Row label="Expected salary" value={c.expectedSalary} />
        </Section>

        <Section title="Application">
          <Row label="Applied for" value={job?.title ?? '—'} />
          <Row label="Source" value={c.source} />
          <Row label="Current stage" value={c.stage} />
          <Row label="Applied on" value={fmtDate(c.createdAt)} />
          <Row label="Last updated" value={fmtDate(c.updatedAt)} />
          <Row label="CV file" value={c.cvFilename} />
        </Section>

        <Section title="AI evaluation">
          <Row label="Overall score" value={numOrDash(c.overallScore)} />
          <Row label="CV qualification" value={numOrDash(c.qualificationScore)} />
          <Row label="Skills match" value={numOrDash(c.skillsMatchScore)} />
          <Row label="Quiz / exam" value={numOrDash(c.quizScore)} />
          <Row label="Recommendation" value={c.recommendation} />
          <Row
            label="Total experience"
            value={c.totalYearsExperience != null ? `${c.totalYearsExperience} years` : null}
          />
          <Row
            label="AI-written likelihood"
            value={c.aiLikelihood != null ? `${c.aiLikelihood}% (${c.aiVerdict ?? '—'})` : null}
          />
          {c.summary && (
            <div className="pt-2">
              <p className="text-sm font-medium text-slate-500">Summary</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{c.summary}</p>
            </div>
          )}
        </Section>

        {(c.strengths?.length || c.concerns?.length) && (
          <Section title="Assessment">
            <ListBlock title="Strengths" items={c.strengths} />
            <ListBlock title="Concerns / gaps" items={c.concerns} />
          </Section>
        )}

        {c.extractedSkills && c.extractedSkills.length > 0 && (
          <Section title="Extracted skills">
            <p className="text-sm text-slate-700">{c.extractedSkills.join(', ')}</p>
          </Section>
        )}

        {c.extractedExperience && c.extractedExperience.length > 0 && (
          <Section title="Experience">
            <div className="space-y-2">
              {c.extractedExperience.map((exp, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-slate-800">
                    {exp.title} {exp.company ? `· ${exp.company}` : ''}
                  </p>
                  {(exp.startDate || exp.endDate) && (
                    <p className="text-xs text-slate-400">
                      {exp.startDate ?? '?'} – {exp.endDate ?? 'Present'}
                    </p>
                  )}
                  {exp.summary && <p className="text-sm text-slate-600">{exp.summary}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {c.extractedEducation && c.extractedEducation.length > 0 && (
          <Section title="Education">
            {c.extractedEducation.map((ed, i) => (
              <p key={i} className="text-sm text-slate-700">
                <span className="font-medium">{ed.institution}</span>
                {[ed.degree, ed.field, ed.year].filter(Boolean).length
                  ? ` — ${[ed.degree, ed.field, ed.year].filter(Boolean).join(' · ')}`
                  : ''}
              </p>
            ))}
          </Section>
        )}

        {c.extractedCertifications && c.extractedCertifications.length > 0 && (
          <Section title="Certifications">
            <p className="text-sm text-slate-700">{c.extractedCertifications.join(', ')}</p>
          </Section>
        )}

        {c.coverNote && (
          <Section title="Cover note">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{c.coverNote}</p>
          </Section>
        )}

        {c.cvText && (
          <Section title="CV text (as extracted)">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{c.cvText}</p>
          </Section>
        )}

        <p className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          Linkage ScreenAI · Personal data export · Confidential
        </p>
      </div>
    </div>
  );
}

function numOrDash(n: number | null): string | null {
  return n != null ? String(n) : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="break-words text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="pt-1">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="text-slate-400">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

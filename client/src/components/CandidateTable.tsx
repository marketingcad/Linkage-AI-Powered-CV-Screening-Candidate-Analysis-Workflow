import { useNavigate } from 'react-router-dom';
import type { CandidateSummary } from '../api/types';
import {
  AiWrittenBadge,
  AnalysisStatusBadge,
  RecommendationBadge,
  ScoreRing,
  SourceBadge,
  StageBadge,
} from './ui';

export default function CandidateTable({
  candidates,
  showJob = false,
}: {
  candidates: CandidateSummary[];
  showJob?: boolean;
}) {
  const navigate = useNavigate();

  if (candidates.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl">
          🗂️
        </div>
        <p className="text-sm font-medium text-slate-600">No candidates yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Applicants will appear here — ranked by AI — as they apply.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-(--shadow-card)">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 text-center">Score</th>
            <th className="px-4 py-3">Candidate</th>
            {showJob && <th className="px-4 py-3">Role</th>}
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Quiz</th>
            <th className="px-4 py-3">CV origin</th>
            <th className="px-4 py-3">Recommendation</th>
            <th className="px-4 py-3">Exp.</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {candidates.map((c, i) => (
            <tr
              key={c.id}
              onClick={() => navigate(`/hr/candidates/${c.id}`)}
              className="group cursor-pointer transition-colors hover:bg-brand-50/40"
            >
              <td className="px-4 py-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-5 text-right text-xs font-medium text-slate-400">{i + 1}</span>
                  <ScoreRing score={c.overallScore ?? c.qualificationScore} size={44} />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{c.fullName}</div>
                <div className="text-xs text-slate-400">{c.email}</div>
              </td>
              {showJob && (
                <td className="px-4 py-3 text-slate-600">{c.jobTitle ?? '—'}</td>
              )}
              <td className="px-4 py-3">
                <SourceBadge source={c.source} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                {c.quizScore != null ? `${c.quizScore}` : '—'}
              </td>
              <td className="px-4 py-3">
                <AiWrittenBadge likelihood={c.aiLikelihood} />
              </td>
              <td className="px-4 py-3">
                <RecommendationBadge value={c.recommendation} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                {c.totalYearsExperience != null ? `${c.totalYearsExperience} yr` : '—'}
              </td>
              <td className="px-4 py-3">
                <StageBadge value={c.stage} />
              </td>
              <td className="px-4 py-3">
                <AnalysisStatusBadge value={c.analysisStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

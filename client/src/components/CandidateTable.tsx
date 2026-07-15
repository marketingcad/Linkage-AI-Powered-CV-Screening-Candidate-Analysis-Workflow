import { useNavigate } from 'react-router-dom';
import type { CandidateSummary } from '../api/types';
import {
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-400">
        No candidates yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-center">Score</th>
            <th className="px-4 py-3">Candidate</th>
            {showJob && <th className="px-4 py-3">Role</th>}
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Quiz</th>
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
              className="cursor-pointer transition hover:bg-slate-50"
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

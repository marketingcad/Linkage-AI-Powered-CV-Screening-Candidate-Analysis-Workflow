import { useNavigate } from 'react-router-dom';
import { LuCopy } from 'react-icons/lu';
import type { CandidateSummary } from '../api/types';
import {
  AiWrittenBadge,
  AnalysisStatusBadge,
  RecommendationBadge,
  ScoreRing,
  SourceBadge,
  StageBadge,
} from './ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

export default function CandidateTable({
  candidates,
  showJob = false,
  selectable = false,
  selectedIds,
  onToggleSelect,
  duplicateEmails,
}: {
  candidates: CandidateSummary[];
  showJob?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  duplicateEmails?: Set<string>;
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

  const headCls =
    'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-(--shadow-card)">
      <Table>
        <TableHeader className="bg-slate-50/70">
          <TableRow className="border-slate-200 hover:bg-transparent">
            {selectable && <TableHead className={`${headCls} w-10`} />}
            <TableHead className={`${headCls} text-center`}>Score</TableHead>
            <TableHead className={headCls}>Candidate</TableHead>
            {showJob && <TableHead className={headCls}>Role</TableHead>}
            <TableHead className={headCls}>Source</TableHead>
            <TableHead className={headCls}>Quiz</TableHead>
            <TableHead className={headCls}>CV origin</TableHead>
            <TableHead className={headCls}>Recommendation</TableHead>
            <TableHead className={headCls}>Exp.</TableHead>
            <TableHead className={headCls}>Stage</TableHead>
            <TableHead className={headCls}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((c, i) => (
            <TableRow
              key={c.id}
              onClick={() => navigate(`/hr/candidates/${c.id}`)}
              className={`group cursor-pointer border-slate-100 hover:bg-brand-50/40 ${
                selectable && selectedIds?.has(c.id) ? 'bg-brand-50/50' : ''
              }`}
            >
              {selectable && (
                <TableCell className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.fullName}`}
                    checked={selectedIds?.has(c.id) ?? false}
                    onChange={() => onToggleSelect?.(c.id)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-500 accent-brand-500 focus:ring-brand-400"
                  />
                </TableCell>
              )}
              <TableCell className="px-4 py-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-5 text-right text-xs font-medium text-slate-400">{i + 1}</span>
                  <ScoreRing score={c.overallScore ?? c.qualificationScore} size={44} />
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-800">{c.fullName}</span>
                  {duplicateEmails?.has(c.email.toLowerCase()) && (
                    <span
                      title="This email applied to more than one role"
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                    >
                      <LuCopy className="h-2.5 w-2.5" />
                      Dup
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{c.email}</div>
              </TableCell>
              {showJob && (
                <TableCell className="px-4 py-3 text-slate-600">{c.jobTitle ?? '—'}</TableCell>
              )}
              <TableCell className="px-4 py-3">
                <SourceBadge source={c.source} />
              </TableCell>
              <TableCell className="px-4 py-3 text-slate-600">
                {c.quizScore != null ? `${c.quizScore}` : '—'}
              </TableCell>
              <TableCell className="px-4 py-3">
                <AiWrittenBadge likelihood={c.aiLikelihood} />
              </TableCell>
              <TableCell className="px-4 py-3">
                <RecommendationBadge value={c.recommendation} />
              </TableCell>
              <TableCell className="px-4 py-3 text-slate-600">
                {c.totalYearsExperience != null ? `${c.totalYearsExperience} yr` : '—'}
              </TableCell>
              <TableCell className="px-4 py-3">
                <StageBadge value={c.stage} />
              </TableCell>
              <TableCell className="px-4 py-3">
                <AnalysisStatusBadge value={c.analysisStatus} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

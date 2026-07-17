import type { CandidateSummary } from '../api/types';
import { RecommendationBadge, ScoreRing, SourceBadge, StageBadge } from './ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/** Numeric metrics where the highest value across candidates is the "best". */
type NumRow = { key: string; label: string; get: (c: CandidateSummary) => number | null };
const NUM_ROWS: NumRow[] = [
  { key: 'overall', label: 'Overall score', get: (c) => c.overallScore },
  { key: 'qual', label: 'CV qualification', get: (c) => c.qualificationScore },
  { key: 'skills', label: 'Skills match', get: (c) => c.skillsMatchScore },
  { key: 'quiz', label: 'Quiz / exam', get: (c) => c.quizScore },
  { key: 'exp', label: 'Experience (yrs)', get: (c) => c.totalYearsExperience },
];

export default function CompareDialog({
  candidates,
  onClose,
}: {
  candidates: CandidateSummary[];
  onClose: () => void;
}) {
  // Best (max) value per numeric row, to highlight the leader.
  const best: Record<string, number | null> = {};
  for (const row of NUM_ROWS) {
    const vals = candidates.map(row.get).filter((n): n is number => n != null);
    best[row.key] = vals.length ? Math.max(...vals) : null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-6 py-4 text-left">
          <DialogTitle className="font-display text-lg font-semibold text-slate-900">
            Compare candidates
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Best value in each row is highlighted.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Metric
                </th>
                {candidates.map((c) => (
                  <th
                    key={c.id}
                    className="min-w-40 border-b border-l border-slate-200 px-4 py-3 text-left align-top"
                  >
                    <div className="flex items-center gap-2.5">
                      <ScoreRing score={c.overallScore ?? c.qualificationScore} size={40} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{c.fullName}</p>
                        <p className="truncate text-xs font-normal text-slate-400">{c.email}</p>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NUM_ROWS.map((row) => (
                <tr key={row.key} className="even:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-600">{row.label}</td>
                  {candidates.map((c) => {
                    const v = row.get(c);
                    const isBest = v != null && best[row.key] != null && v === best[row.key];
                    return (
                      <td key={c.id} className="border-l border-slate-100 px-4 py-2.5">
                        <span
                          className={`inline-flex min-w-8 justify-center rounded px-1.5 py-0.5 text-sm font-semibold ${
                            isBest ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700'
                          }`}
                        >
                          {v ?? '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <MetaRow label="Recommendation" candidates={candidates}>
                {(c) => <RecommendationBadge value={c.recommendation} />}
              </MetaRow>
              <MetaRow label="Stage" candidates={candidates}>
                {(c) => <StageBadge value={c.stage} />}
              </MetaRow>
              <MetaRow label="Source" candidates={candidates}>
                {(c) => <SourceBadge source={c.source} />}
              </MetaRow>
              <MetaRow label="AI-written" candidates={candidates}>
                {(c) => (
                  <span className="text-sm text-slate-600">
                    {c.aiLikelihood != null ? `${c.aiLikelihood}%` : '—'}
                  </span>
                )}
              </MetaRow>
              <tr className="even:bg-slate-50/50">
                <td className="px-4 py-2.5 align-top font-medium text-slate-600">AI summary</td>
                {candidates.map((c) => (
                  <td
                    key={c.id}
                    className="border-l border-slate-100 px-4 py-2.5 align-top text-xs leading-relaxed text-slate-500"
                  >
                    {c.summary ?? '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({
  label,
  candidates,
  children,
}: {
  label: string;
  candidates: CandidateSummary[];
  children: (c: CandidateSummary) => React.ReactNode;
}) {
  return (
    <tr className="even:bg-slate-50/50">
      <td className="px-4 py-2.5 font-medium text-slate-600">{label}</td>
      {candidates.map((c) => (
        <td key={c.id} className="border-l border-slate-100 px-4 py-2.5">
          {children(c)}
        </td>
      ))}
    </tr>
  );
}

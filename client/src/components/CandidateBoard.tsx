import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CandidateStage, CandidateSummary } from '../api/types';
import { RecommendationBadge, ScoreRing, SourceBadge } from './ui';

const COLUMNS: { stage: CandidateStage; label: string; dot: string; ring: string }[] = [
  { stage: 'new', label: 'New', dot: 'bg-slate-400', ring: 'ring-slate-200' },
  { stage: 'shortlisted', label: 'Shortlisted', dot: 'bg-brand-500', ring: 'ring-brand-200' },
  { stage: 'interviewing', label: 'Interviewing', dot: 'bg-violet-500', ring: 'ring-violet-200' },
  { stage: 'hired', label: 'Hired', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  { stage: 'rejected', label: 'Rejected', dot: 'bg-rose-500', ring: 'ring-rose-200' },
];

function rank(c: CandidateSummary) {
  return c.overallScore ?? c.qualificationScore ?? -1;
}

export default function CandidateBoard({
  candidates,
  onMove,
}: {
  candidates: CandidateSummary[];
  onMove: (id: string, stage: CandidateStage) => void;
}) {
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CandidateStage | null>(null);
  const draggedRef = useRef(false);

  const byStage = (stage: CandidateStage) =>
    candidates.filter((c) => c.stage === stage).sort((a, b) => rank(b) - rank(a));

  function handleDrop(stage: CandidateStage) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const cand = candidates.find((c) => c.id === id);
    if (cand && cand.stage !== stage) onMove(id, stage);
  }

  return (
    // Large screens: all 5 columns fit as an even grid (no scrollbar).
    // Smaller screens: fall back to a horizontally scrollable row.
    <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-5 lg:overflow-x-visible">
      {COLUMNS.map((col) => {
        const items = byStage(col.stage);
        const isOver = overStage === col.stage;
        return (
          <div
            key={col.stage}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overStage !== col.stage) setOverStage(col.stage);
            }}
            onDragLeave={(e) => {
              // Only clear when the pointer actually leaves the column, not its children.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStage((s) => (s === col.stage ? null : s));
              }
            }}
            onDrop={() => handleDrop(col.stage)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-50/60 transition-colors lg:w-auto lg:min-w-0 ${
              isOver ? 'border-brand-400 bg-brand-50/70' : 'border-slate-200/70'
            }`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                <span className="text-sm font-semibold text-slate-700">{col.label}</span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex min-h-24 flex-1 flex-col gap-2.5 px-3 pb-3">
              {items.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    draggedRef.current = true;
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', c.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                    // Reset the drag guard after the click (if any) would have fired.
                    setTimeout(() => (draggedRef.current = false), 0);
                  }}
                  onClick={() => {
                    if (draggedRef.current) return;
                    navigate(`/hr/candidates/${c.id}`);
                  }}
                  className={`group cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-(--shadow-card) transition active:cursor-grabbing hover:border-brand-300 hover:shadow-(--shadow-raised) ${
                    dragId === c.id ? 'rotate-[1.5deg] opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <ScoreRing score={c.overallScore ?? c.qualificationScore} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{c.fullName}</p>
                      <p className="truncate text-xs text-slate-400">{c.jobTitle ?? '—'}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <RecommendationBadge value={c.recommendation} />
                    <SourceBadge source={c.source} />
                  </div>
                </article>
              ))}

              {items.length === 0 && (
                <div
                  className={`flex flex-1 items-center justify-center rounded-xl border-2 border-dashed py-8 text-center text-xs ${
                    isOver ? 'border-brand-300 text-brand-500' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  {isOver ? 'Drop here' : 'No candidates'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

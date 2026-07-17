import { useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  LuArrowRightLeft,
  LuColumns3,
  LuGitCompare,
  LuSearch,
  LuTable,
  LuX,
} from 'react-icons/lu';
import { fetchCandidates, updateCandidateStage } from '../api/endpoints';
import type { CandidateStage, CandidateSummary } from '../api/types';
import { Alert, Button, Spinner, STAGES, STAGE_ICONS } from '../components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import CandidateTable from '../components/CandidateTable';
import CandidateBoard from '../components/CandidateBoard';
import CompareDialog from '../components/CompareDialog';

const STAGE_FILTERS: { value: '' | CandidateStage; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

type View = 'board' | 'table';
type AiFilter = '' | 'low' | 'medium' | 'high';

const VIEWS: { value: View; label: string; Icon: IconType }[] = [
  { value: 'board', label: 'Board', Icon: LuColumns3 },
  { value: 'table', label: 'Table', Icon: LuTable },
];

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [view, setView] = useState<View>('board');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);

  // Filters
  const [stage, setStage] = useState<'' | CandidateStage>('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState('');
  const [aiFilter, setAiFilter] = useState<AiFilter>('');
  const [skill, setSkill] = useState('');

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    fetchCandidates()
      .then((res) => setCandidates(res.candidates))
      .catch(() => setError('Failed to load candidates.'))
      .finally(() => setLoading(false));
  }, []);

  // Optimistically move a candidate to a new stage; revert on failure.
  async function handleMove(id: string, toStage: CandidateStage) {
    const prev = candidates;
    const target = prev.find((c) => c.id === id);
    if (!target || target.stage === toStage) return;
    setMoveError(null);
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, stage: toStage } : c)));
    try {
      await updateCandidateStage(id, toStage);
    } catch {
      setCandidates(prev); // revert
      setMoveError(`Couldn't move ${target.fullName}. Please try again.`);
    }
  }

  // Bulk move every selected candidate to a stage (optimistic).
  async function bulkMove(toStage: CandidateStage) {
    const ids = [...selected];
    if (!ids.length) return;
    const prev = candidates;
    setMoveError(null);
    setCandidates((cs) => cs.map((c) => (selected.has(c.id) ? { ...c, stage: toStage } : c)));
    setSelected(new Set());
    try {
      await Promise.all(ids.map((id) => updateCandidateStage(id, toStage)));
    } catch {
      setCandidates(prev);
      setMoveError('Some candidates could not be moved. Please refresh and try again.');
    }
  }

  const sources = useMemo(
    () => [...new Set(candidates.map((c) => c.source))].sort(),
    [candidates],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const skillQ = skill.trim().toLowerCase();
    const min = minScore ? Number(minScore) : null;
    return candidates.filter((c) => {
      if (stage && c.stage !== stage) return false;
      if (source && c.source !== source) return false;
      if (q && !`${c.fullName} ${c.email} ${c.jobTitle ?? ''}`.toLowerCase().includes(q)) return false;
      if (min != null) {
        const s = c.overallScore ?? c.qualificationScore;
        if (s == null || s < min) return false;
      }
      if (aiFilter) {
        const a = c.aiLikelihood;
        if (a == null) return false;
        if (aiFilter === 'low' && a >= 40) return false;
        if (aiFilter === 'medium' && (a < 40 || a > 70)) return false;
        if (aiFilter === 'high' && a <= 70) return false;
      }
      if (skillQ && !(c.extractedSkills ?? []).some((s) => s.toLowerCase().includes(skillQ)))
        return false;
      return true;
    });
  }, [candidates, stage, source, search, minScore, aiFilter, skill]);

  const filtersActive = Boolean(stage || search || source || minScore || aiFilter || skill);
  function clearFilters() {
    setStage('');
    setSearch('');
    setSource('');
    setMinScore('');
    setAiFilter('');
    setSkill('');
  }

  // Emails that appear on more than one candidate → flag as duplicates/re-applicants.
  const duplicateEmails = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      const e = c.email.toLowerCase();
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([e]) => e));
  }, [candidates]);

  return (
    <div className="animate-rise space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
          <p className="mt-1 text-sm text-slate-500">
            {view === 'board'
              ? 'Drag candidates between stages to move them through the pipeline.'
              : 'Search, filter, compare, and bulk-manage applicants across all roles.'}
          </p>
        </div>

        {/* View toggle */}
        <div
          role="tablist"
          aria-label="Candidate view"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        >
          {VIEWS.map(({ value, label, Icon }) => {
            const active = view === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(51,88,240,0.6)]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {moveError && <Alert kind="error">{moveError}</Alert>}

      {loading ? (
        <Spinner label="Loading candidates…" />
      ) : view === 'board' ? (
        <CandidateBoard candidates={candidates} onMove={handleMove} />
      ) : (
        <div className="space-y-4">
          {/* Filters */}
          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-(--shadow-card)">
            <div className="flex flex-wrap gap-2">
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStage(f.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    stage === f.value
                      ? 'bg-brand-500 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-52 flex-1">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, or role…"
                  className={`${inputCls} w-full pl-9`}
                />
              </div>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="Min score"
                className={`${inputCls} w-28`}
              />
              <select
                value={aiFilter}
                onChange={(e) => setAiFilter(e.target.value as AiFilter)}
                className={inputCls}
              >
                <option value="">Any AI-likelihood</option>
                <option value="low">AI: Low</option>
                <option value="medium">AI: Medium</option>
                <option value="high">AI: High</option>
              </select>
              <input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="Skill…"
                className={`${inputCls} w-32`}
              />
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <LuX className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2">
              <span className="text-sm font-medium text-brand-700">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <LuArrowRightLeft className="h-4 w-4" />
                      Move to
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {STAGES.map((s) => {
                      const Icon = STAGE_ICONS[s];
                      return (
                        <DropdownMenuItem key={s} onSelect={() => void bulkMove(s)}>
                          <Icon className="text-slate-500" />
                          <span className="capitalize">{s}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  onClick={() => setComparing(true)}
                  disabled={selected.size < 2 || selected.size > 4}
                  title={
                    selected.size < 2
                      ? 'Select at least 2'
                      : selected.size > 4
                        ? 'Compare up to 4'
                        : undefined
                  }
                >
                  <LuGitCompare className="h-4 w-4" />
                  Compare
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  <LuX className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
          )}

          <CandidateTable
            candidates={filtered}
            showJob
            selectable
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            duplicateEmails={duplicateEmails}
          />

          <p className="text-xs text-slate-400">
            Showing {filtered.length} of {candidates.length} candidate
            {candidates.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {comparing && (
        <CompareDialog
          candidates={candidates.filter((c) => selected.has(c.id))}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}

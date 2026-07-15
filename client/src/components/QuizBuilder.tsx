import type { QuizQuestion, QuizQuestionType } from '../api/types';

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

const TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: 'Single choice',
  multiple: 'Multiple choice',
  short: 'Short answer (AI-graded)',
};

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export default function QuizBuilder({
  value,
  onChange,
}: {
  value: QuizQuestion[];
  onChange: (quiz: QuizQuestion[]) => void;
}) {
  function addQuestion(type: QuizQuestionType) {
    const base: QuizQuestion = {
      id: uid(),
      type,
      prompt: '',
      points: 1,
      ...(type === 'short'
        ? { rubric: '' }
        : {
            options: [
              { id: uid(), text: '' },
              { id: uid(), text: '' },
            ],
            correctOptionIds: [],
          }),
    };
    onChange([...value, base]);
  }

  function update(id: string, patch: Partial<QuizQuestion>) {
    onChange(value.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function remove(id: string) {
    onChange(value.filter((q) => q.id !== id));
  }

  function addOption(qid: string) {
    update(qid, {
      options: [...(value.find((q) => q.id === qid)?.options ?? []), { id: uid(), text: '' }],
    });
  }

  function updateOption(qid: string, oid: string, text: string) {
    const q = value.find((x) => x.id === qid);
    if (!q?.options) return;
    update(qid, { options: q.options.map((o) => (o.id === oid ? { ...o, text } : o)) });
  }

  function removeOption(qid: string, oid: string) {
    const q = value.find((x) => x.id === qid);
    if (!q?.options) return;
    update(qid, {
      options: q.options.filter((o) => o.id !== oid),
      correctOptionIds: (q.correctOptionIds ?? []).filter((id) => id !== oid),
    });
  }

  function toggleCorrect(qid: string, oid: string) {
    const q = value.find((x) => x.id === qid);
    if (!q) return;
    const current = q.correctOptionIds ?? [];
    if (q.type === 'single') {
      update(qid, { correctOptionIds: [oid] });
    } else {
      update(qid, {
        correctOptionIds: current.includes(oid)
          ? current.filter((id) => id !== oid)
          : [...current, oid],
      });
    }
  }

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No quiz yet. Add questions to screen applicants with a position-specific exam.
        </p>
      )}

      {value.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Q{i + 1} · {TYPE_LABELS[q.type]}
            </span>
            <button
              type="button"
              onClick={() => remove(q.id)}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Remove
            </button>
          </div>

          <textarea
            value={q.prompt}
            onChange={(e) => update(q.id, { prompt: e.target.value })}
            rows={2}
            placeholder="Question prompt"
            className={inputCls}
          />

          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs text-slate-500">Points</label>
            <input
              type="number"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) => update(q.id, { points: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          {q.type === 'short' ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Grading rubric (guides the AI; not shown to applicants)
              </label>
              <textarea
                value={q.rubric ?? ''}
                onChange={(e) => update(q.id, { rubric: e.target.value })}
                rows={2}
                placeholder="e.g. Full marks if the answer explains X and mentions Y."
                className={inputCls}
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Options ({q.type === 'single' ? 'pick one correct' : 'pick all correct'})
              </p>
              {(q.options ?? []).map((o) => {
                const checked = (q.correctOptionIds ?? []).includes(o.id);
                return (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      type={q.type === 'single' ? 'radio' : 'checkbox'}
                      checked={checked}
                      onChange={() => toggleCorrect(q.id, o.id)}
                      title="Mark correct"
                      className="h-4 w-4 accent-brand-500"
                    />
                    <input
                      value={o.text}
                      onChange={(e) => updateOption(q.id, o.id, e.target.value)}
                      placeholder="Option text"
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                    />
                    {(q.options?.length ?? 0) > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(q.id, o.id)}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label="Remove option"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => addOption(q.id)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                + Add option
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addQuestion('single')}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Single choice
        </button>
        <button
          type="button"
          onClick={() => addQuestion('multiple')}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Multiple choice
        </button>
        <button
          type="button"
          onClick={() => addQuestion('short')}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Short answer
        </button>
      </div>
    </div>
  );
}
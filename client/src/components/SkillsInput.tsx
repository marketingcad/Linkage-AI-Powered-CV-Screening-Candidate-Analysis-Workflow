import { useRef, useState } from 'react';
import { LuPlus, LuX } from 'react-icons/lu';

/**
 * Tag-style editor for a list of skills.
 *
 * Replaces a single comma-separated text field: at 20-30 skills that field became one long
 * unreadable line where a missing comma silently merged two skills into one. Each skill is
 * now a separate removable chip.
 *
 * Entry is deliberately forgiving — Enter or the Add button commits, and commas still split,
 * so pasting an existing "React, TypeScript, Node" list produces three chips rather than one.
 */
/**
 * Merge raw typed/pasted text into an existing skill list.
 *
 * Exported so the parsing rules (comma splitting, trimming, case-insensitive de-duplication,
 * the cap) can be tested without a DOM.
 */
export function mergeSkills(
  current: string[],
  raw: string,
  max: number,
): { next: string[]; duplicates: number; hitMax: boolean } {
  const parts = raw
    .split(',')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const next = [...current];
  let duplicates = 0;
  let hitMax = false;
  for (const part of parts) {
    if (next.length >= max) {
      hitMax = true;
      break;
    }
    if (next.some((s) => s.toLowerCase() === part.toLowerCase())) {
      duplicates++;
      continue;
    }
    next.push(part);
  }
  return { next, duplicates, hitMax };
}

export default function SkillsInput({
  value,
  onChange,
  placeholder,
  inputId,
  max = 60,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  inputId?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commit(raw: string) {
    if (!raw.trim()) return;
    const { next, duplicates, hitMax } = mergeSkills(value, raw, max);

    setDraft('');
    setNotice(
      hitMax
        ? `Maximum ${max} skills.`
        : duplicates > 0
          ? `${duplicates === 1 ? 'That skill is' : `${duplicates} skills are`} already in the list.`
          : null,
    );
    if (next.length !== value.length) onChange(next);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setNotice(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter must not submit the surrounding job form.
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      // Familiar from every other tag input: backspace on an empty field drops the last chip.
      remove(value.length - 1);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={inputId}
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => {
            commit(draft);
            inputRef.current?.focus();
          }}
          disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <LuPlus className="h-4 w-4" />
          Add
        </button>
      </div>

      {notice && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{notice}</p>}

      {value.length > 0 && (
        <>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {value.map((skill, i) => (
              <li
                key={`${skill}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
              >
                <span className="whitespace-nowrap">{skill}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${skill}`}
                  className="rounded-full p-0.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-800 dark:hover:bg-brand-900/60"
                >
                  <LuX className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-slate-600">
            {value.length} skill{value.length === 1 ? '' : 's'} · press Enter or comma to add
          </p>
        </>
      )}
    </div>
  );
}

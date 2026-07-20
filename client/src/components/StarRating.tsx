import { useState } from 'react';
import { LuStar } from 'react-icons/lu';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' } as const;

/**
 * 1–5 star rating. Read-only by default (fills to the rounded value); pass
 * `onChange` to make it an interactive picker with hover preview.
 */
export default function StarRating({
  value,
  onChange,
  size = 'md',
  className = '',
}: {
  value: number | null | undefined;
  onChange?: (v: number) => void;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';
  const active = hover || Math.round(value ?? 0);
  const dim = SIZES[size];

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} role={interactive ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        const StarEl = (
          <LuStar
            className={`${dim} transition-colors ${
              filled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'
            }`}
          />
        );
        if (!interactive) return <span key={star}>{StarEl}</span>;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={Math.round(value ?? 0) === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange!(star)}
            className="rounded p-0.5 transition hover:scale-110"
          >
            {StarEl}
          </button>
        );
      })}
    </div>
  );
}

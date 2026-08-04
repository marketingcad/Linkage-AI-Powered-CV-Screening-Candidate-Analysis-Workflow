import { describe, expect, it } from 'vitest';
import { RATING_ANCHORS, scoreFromCompetencies, type CompetencyRating } from './gemini.js';

const c = (competency: string, rating: number): CompetencyRating => ({
  competency,
  rating,
  evidence: 'x',
});

describe('scoreFromCompetencies', () => {
  it('maps the anchored scale onto 0–100 (1 → 0, 3 → 50, 5 → 100)', () => {
    expect(scoreFromCompetencies([c('a', 1)])).toBe(0);
    expect(scoreFromCompetencies([c('a', 3)])).toBe(50);
    expect(scoreFromCompetencies([c('a', 5)])).toBe(100);
  });

  it('averages across assessed competencies', () => {
    expect(scoreFromCompetencies([c('a', 4), c('b', 2)])).toBe(50); // mean 3
    expect(scoreFromCompetencies([c('a', 5), c('b', 4), c('c', 3)])).toBe(75); // mean 4
  });

  // A competency the interview never covered must not drag the score down — the candidate
  // was never given the chance to answer it.
  it('excludes not-assessed (0) competencies rather than counting them as low', () => {
    expect(scoreFromCompetencies([c('a', 5), c('unasked', 0)])).toBe(100);
    expect(scoreFromCompetencies([c('a', 3), c('b', 3), c('unasked', 0)])).toBe(50);
  });

  it('returns 0 when nothing could be assessed', () => {
    expect(scoreFromCompetencies([])).toBe(0);
    expect(scoreFromCompetencies([c('a', 0), c('b', 0)])).toBe(0);
  });

  it('ignores out-of-range ratings', () => {
    expect(scoreFromCompetencies([c('a', 5), c('bogus', 9), c('neg', -2)])).toBe(100);
  });
});

describe('RATING_ANCHORS', () => {
  it('defines every point on the scale, including not-assessed', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      expect(RATING_ANCHORS[n]).toBeTruthy();
    }
  });
});

import { describe, it, expect } from 'vitest';
import { isRoundInProgress, parseRel, diffToParStr, toParStr, sumAllRelative } from '../public/scoring-utils.js';

// ── isRoundInProgress ───────────────────────────────────────────────────────

describe('isRoundInProgress', () => {
  it('returns true for numeric thru values', () => {
    expect(isRoundInProgress('9')).toBe(true);
    expect(isRoundInProgress('12')).toBe(true);
    expect(isRoundInProgress('1')).toBe(true);
  });

  it('returns false when finished (F or 18)', () => {
    expect(isRoundInProgress('F')).toBe(false);
    expect(isRoundInProgress('18')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isRoundInProgress(null)).toBe(false);
    expect(isRoundInProgress(undefined)).toBe(false);
    expect(isRoundInProgress('')).toBe(false);
  });
});

// ── parseRel ────────────────────────────────────────────────────────────────

describe('parseRel', () => {
  it('parses negative values', () => {
    expect(parseRel('-4')).toBe(-4);
    expect(parseRel('-1')).toBe(-1);
  });

  it('parses positive values', () => {
    expect(parseRel('+2')).toBe(2);
    expect(parseRel('+10')).toBe(10);
  });

  it('parses even par', () => {
    expect(parseRel('E')).toBe(0);
  });

  it('returns null for falsy inputs', () => {
    expect(parseRel(null)).toBeNull();
    expect(parseRel(undefined)).toBeNull();
    expect(parseRel('')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseRel('abc')).toBeNull();
  });
});

// ── diffToParStr ────────────────────────────────────────────────────────────

describe('diffToParStr', () => {
  it('formats even par', () => {
    expect(diffToParStr(0)).toBe('E');
  });

  it('formats over par', () => {
    expect(diffToParStr(3)).toBe('+3');
  });

  it('formats under par with red span', () => {
    expect(diffToParStr(-5)).toBe('<span class="text-red-600">-5</span>');
  });
});

// ── toParStr ────────────────────────────────────────────────────────────────

describe('toParStr', () => {
  it('computes diff from gross total and delegates to diffToParStr', () => {
    // 68 over 1 round at par 72 = -4
    expect(toParStr(68, 1, 72)).toBe('<span class="text-red-600">-4</span>');
    // 144 over 2 rounds at par 72 = E
    expect(toParStr(144, 2, 72)).toBe('E');
    // 150 over 2 rounds at par 72 = +6
    expect(toParStr(150, 2, 72)).toBe('+6');
  });
});

// ── sumAllRelative ──────────────────────────────────────────────────────────

describe('sumAllRelative', () => {
  const par = 72;

  it('sums completed rounds using rel values', () => {
    const scores = ['68', '70'];
    const thrus = ['F', 'F'];
    const rels = ['-4', '-2'];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -6, count: 2 });
  });

  it('includes in-progress round via rel value', () => {
    const scores = ['68', '36'];
    const thrus = ['F', '10'];
    const rels = ['-4', '-2'];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -6, count: 2 });
  });

  it('falls back to gross minus par for completed rounds without rel', () => {
    const scores = ['68', '70'];
    const thrus = ['F', 'F'];
    const rels = [null, null];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -6, count: 2 });
  });

  it('skips in-progress rounds with no rel data', () => {
    const scores = ['68', '36'];
    const thrus = ['F', '10'];
    const rels = ['-4', null];
    // only the completed round counts
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -4, count: 1 });
  });

  it('skips CUT and WD entries', () => {
    const scores = ['68', 'CUT', 'WD'];
    const thrus = ['F', null, null];
    const rels = ['-4', null, null];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -4, count: 1 });
  });

  it('skips null/undefined/empty scores', () => {
    const scores = ['68', null, undefined, ''];
    const thrus = ['F', null, null, null];
    const rels = ['-4', null, null, null];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -4, count: 1 });
  });

  it('returns zero count when no valid rounds', () => {
    const scores = [null, null, null, null];
    const thrus = [null, null, null, null];
    const rels = [null, null, null, null];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: 0, count: 0 });
  });

  it('handles even-par rel values', () => {
    const scores = ['72', '72'];
    const thrus = ['F', 'F'];
    const rels = ['E', 'E'];
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: 0, count: 2 });
  });

  it('mixes rel and gross fallback across rounds', () => {
    const scores = ['68', '74'];
    const thrus = ['F', 'F'];
    const rels = ['-4', null]; // first has rel, second falls back to gross
    expect(sumAllRelative(scores, thrus, rels, par)).toEqual({ diff: -2, count: 2 });
  });
});

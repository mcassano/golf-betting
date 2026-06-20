import { describe, it, expect } from 'vitest';
import { isRoundInProgress, parseRel, diffToParStr, toParStr, sumAllRelative, didMissCut } from '../public/scoring-utils.js';

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

// ── didMissCut ──────────────────────────────────────────────────────────────

describe('didMissCut', () => {
  const par = 72;

  it('returns false for a made-cut golfer (R1+R2 < +5)', () => {
    const s = { day1: '71', day2: '72', day1Rel: '-1', day2Rel: 'E', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('returns true at the +5 threshold via rel values', () => {
    const s = { day1: '75', day2: '74', day1Rel: '+3', day2Rel: '+2', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('returns true above +5 via rel values', () => {
    // Bryson at the Masters: 76 + 74 = +6
    const s = { day1: '76', day2: '74', day1Rel: '+4', day2Rel: '+2', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('returns false just below +5', () => {
    // Jon Rahm at the Masters: 78 + 70 = +4
    const s = { day1: '78', day2: '70', day1Rel: '+6', day2Rel: '-2', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('returns true on explicit CUT marker even without numeric scores', () => {
    const s = { day1: '76', day2: '78', day3: 'CUT', day4: 'CUT' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('returns true when CUT appears alongside valid R1/R2 scores', () => {
    const s = { day1: '75', day2: '75', day3: 'CUT' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('falls back to gross-minus-par when rel is absent', () => {
    const s = { day1: '76', day2: '74', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('does not trigger when R1 is still in progress (no rel)', () => {
    const s = { day1: '40', day2: '74', day1Thru: '9', day2Thru: 'F' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('does not trigger when R2 is still in progress (no rel)', () => {
    const s = { day1: '76', day2: '40', day1Thru: 'F', day2Thru: '9' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('respects rel during an in-progress round (rel is authoritative)', () => {
    // R2 in progress but ESPN rel already says +3 thru 14; R1 final at +3 → sum +6
    const s = { day1: '75', day2: '55', day1Rel: '+3', day2Rel: '+3', day1Thru: 'F', day2Thru: '14' };
    expect(didMissCut(s, par)).toBe(true);
  });

  it('returns false when R2 is missing entirely', () => {
    const s = { day1: '76', day1Rel: '+4', day1Thru: 'F' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('returns false for empty/undefined scores object', () => {
    expect(didMissCut({}, par)).toBe(false);
    expect(didMissCut(undefined, par)).toBe(false);
    expect(didMissCut(null, par)).toBe(false);
  });

  it('ignores WD in R1/R2 slots (does not trigger miss)', () => {
    // WD before cut — not a miss, they withdrew
    const s = { day1: '76', day2: 'WD', day1Rel: '+4' };
    expect(didMissCut(s, par)).toBe(false);
  });

  it('honors an explicit cut line: +3 made when the line is +4', () => {
    // Dustin Johnson case: 66 + 77 = +3 to par at par 70
    const s = { day1: '66', day2: '77', day1Thru: 'F', day2Thru: 'F' };
    expect(didMissCut(s, 70, 4)).toBe(false);
  });

  it('honors an explicit cut line: +5 misses when the line is +4', () => {
    const s = { day1: '74', day2: '75', day1Thru: 'F', day2Thru: 'F' }; // +9 at par 70
    expect(didMissCut(s, 70, 4)).toBe(true);
  });

  it('honors a tighter cut line: +3 misses when the line is +2', () => {
    const s = { day1: '66', day2: '77', day1Thru: 'F', day2Thru: 'F' }; // +3 at par 70
    expect(didMissCut(s, 70, 2)).toBe(true);
  });

  it('made the cut exactly at the line (not worse than)', () => {
    const s = { day1: '72', day2: '72', day1Thru: 'F', day2Thru: 'F' }; // +4 at par 70
    expect(didMissCut(s, 70, 4)).toBe(false);
  });
});

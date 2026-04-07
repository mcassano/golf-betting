import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveScore, isWD, bestNScore, countMaxWDs, encodeKey } from '../services/scoring.js';

// ── isWD ─────────────────────────────────────────────────────────────────────

describe('isWD', () => {
  it('returns true for "WD"', () => {
    expect(isWD('WD')).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isWD('CUT')).toBe(false);
    expect(isWD('72')).toBe(false);
    expect(isWD(null)).toBe(false);
    expect(isWD(undefined)).toBe(false);
    expect(isWD('')).toBe(false);
  });
});

// ── resolveScore ─────────────────────────────────────────────────────────────

describe('resolveScore', () => {
  it('returns null for missing values', () => {
    expect(resolveScore(null)).toBeNull();
    expect(resolveScore(undefined)).toBeNull();
    expect(resolveScore('')).toBeNull();
  });

  it('returns null for WD', () => {
    expect(resolveScore('WD')).toBeNull();
  });

  it('returns PENALTY (99) for CUT', () => {
    expect(resolveScore('CUT')).toBe(99);
  });

  it('parses numeric strings', () => {
    expect(resolveScore('68')).toBe(68);
    expect(resolveScore('72')).toBe(72);
    expect(resolveScore('80')).toBe(80);
  });

  it('returns PENALTY for garbage input', () => {
    expect(resolveScore('abc')).toBe(99);
  });
});

// ── encodeKey ────────────────────────────────────────────────────────────────

describe('encodeKey', () => {
  it('replaces spaces with underscores', () => {
    expect(encodeKey('Tiger Woods')).toBe('Tiger_Woods');
  });

  it('strips special characters', () => {
    expect(encodeKey("Rory O'Brien")).toBe('Rory_OBrien');
  });

  it('preserves hyphens', () => {
    expect(encodeKey('Si Woo Kim')).toBe('Si_Woo_Kim');
    expect(encodeKey('Kim-Jones')).toBe('Kim-Jones');
  });

  it('collapses multiple spaces', () => {
    expect(encodeKey('Tiger  Woods')).toBe('Tiger_Woods');
  });
});

// ── bestNScore ───────────────────────────────────────────────────────────────

describe('bestNScore', () => {
  it('sums all scores when bestN equals count', () => {
    const result = bestNScore(['68', '70', '72', '74', '71', '69'], 6);
    expect(result.total).toBe(68 + 70 + 72 + 74 + 71 + 69);
    expect(result.partial).toBe(false);
  });

  it('takes the best N scores', () => {
    const result = bestNScore(['68', '70', '72', '74', '71', '80'], 4);
    // best 4: 68, 69? No: 68, 70, 71, 72
    expect(result.total).toBe(68 + 70 + 71 + 72);
    expect(result.partial).toBe(false);
  });

  it('excludes WD golfers from scoring', () => {
    const result = bestNScore(['68', '70', 'WD', '74', '71', '69'], 5);
    // 5 non-WD scores: 68, 69, 70, 71, 74 → best 5 = all
    expect(result.total).toBe(68 + 69 + 70 + 71 + 74);
    expect(result.partial).toBe(false);
  });

  it('marks partial when some scores are missing', () => {
    const result = bestNScore(['68', null, '72', '74', '71', '69'], 6);
    expect(result.partial).toBe(true);
  });

  it('marks partial when bestN is 0 (all golfers WD) [bug 2 fix]', () => {
    const result = bestNScore(['WD', 'WD', 'WD', 'WD', 'WD', 'WD'], 0);
    expect(result.total).toBe(0);
    expect(result.partial).toBe(true);
  });

  it('marks partial when no valid scores exist [bug 2 fix]', () => {
    const result = bestNScore([null, null, null, null, null, null], 6);
    expect(result.total).toBe(0);
    expect(result.partial).toBe(true);
  });

  it('marks partial when all are WD even if bestN > 0 [bug 2 fix]', () => {
    const result = bestNScore(['WD', 'WD', 'WD'], 3);
    expect(result.total).toBe(0);
    expect(result.partial).toBe(true);
  });

  it('uses PENALTY (99) for CUT golfers', () => {
    const result = bestNScore(['68', 'CUT', '70'], 3);
    expect(result.total).toBe(68 + 70 + 99);
    expect(result.partial).toBe(false);
  });

  it('handles fewer valid scores than bestN gracefully', () => {
    // 2 WDs, bestN=5 → only 4 valid scores available
    const result = bestNScore(['68', '70', 'WD', 'WD', '71', '69'], 5);
    expect(result.total).toBe(68 + 69 + 70 + 71);
    expect(result.partial).toBe(false);
  });
});

// ── countMaxWDs ──────────────────────────────────────────────────────────────

describe('countMaxWDs', () => {
  it('returns 0 when no WDs', () => {
    const teams = {
      alice: ['68', '70', '72', '74', '71', '69'],
      bob: ['67', '71', '73', '75', '70', '68'],
    };
    expect(countMaxWDs(teams)).toBe(0);
  });

  it('returns the max WD count across teams', () => {
    const teams = {
      alice: ['68', 'WD', '72', '74', '71', '69'],
      bob: ['67', 'WD', '73', 'WD', '70', '68'],
      charlie: ['66', '70', '72', '74', '71', '69'],
    };
    expect(countMaxWDs(teams)).toBe(2);
  });

  it('handles all WDs', () => {
    const teams = {
      alice: ['WD', 'WD', 'WD', 'WD', 'WD', 'WD'],
    };
    expect(countMaxWDs(teams)).toBe(6);
  });

  it('ignores null/missing scores (not WD)', () => {
    const teams = {
      alice: [null, null, '72', '74', '71', '69'],
    };
    expect(countMaxWDs(teams)).toBe(0);
  });
});

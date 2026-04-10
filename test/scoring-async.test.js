import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store to mock Redis
const store = {};
vi.mock('../services/redis.js', () => ({
  get: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  mget: vi.fn((...keys) => Promise.resolve(keys.map((k) => store[k] ?? null))),
  getJSON: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  set: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
  setJSON: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
}));

import {
  teamScoreForDay,
  teamScoreBest2ForDay,
  teamOverallScore,
  allSelectedScoresForDay,
} from '../services/scoring.js';

function clearStore() {
  for (const key of Object.keys(store)) delete store[key];
}

function setTeam(user, golfers) {
  store[`teams:${user}`] = golfers;
}

function setScore(golfer, day, score) {
  const key = golfer.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
  store[`scores:${key}:day${day}`] = score;
}

function setThru(golfer, day, thru) {
  const key = golfer.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
  store[`scores:${key}:day${day}:thru`] = thru;
}

beforeEach(() => clearStore());

// ── teamScoreForDay ──────────────────────────────────────────────────────────

describe('teamScoreForDay', () => {
  it('sums all 6 golfers when bestN=6', async () => {
    const golfers = ['A', 'B', 'C', 'D', 'E', 'F'];
    setTeam('alice', golfers);
    golfers.forEach((g, i) => setScore(g, 1, String(68 + i)));
    const res = await teamScoreForDay('alice', 1, 6);
    expect(res.total).toBe(68 + 69 + 70 + 71 + 72 + 73);
    expect(res.partial).toBe(false);
  });

  it('takes best N when bestN < 6', async () => {
    const golfers = ['A', 'B', 'C', 'D', 'E', 'F'];
    setTeam('alice', golfers);
    [68, 75, 70, 80, 71, 69].forEach((s, i) => setScore(golfers[i], 1, String(s)));
    const res = await teamScoreForDay('alice', 1, 4);
    // best 4: 68, 69, 70, 71
    expect(res.total).toBe(68 + 69 + 70 + 71);
    expect(res.partial).toBe(false);
  });

  it('marks partial when scores are missing', async () => {
    setTeam('alice', ['A', 'B', 'C']);
    setScore('A', 1, '70');
    // B and C have no scores
    const res = await teamScoreForDay('alice', 1, 3);
    expect(res.partial).toBe(true);
  });

  it('excludes WD golfers', async () => {
    setTeam('alice', ['A', 'B', 'C']);
    setScore('A', 1, '68');
    setScore('B', 1, 'WD');
    setScore('C', 1, '72');
    const res = await teamScoreForDay('alice', 1, 2);
    // 2 non-WD scores: 68, 72 → best 2 = 68 + 72
    expect(res.total).toBe(68 + 72);
    expect(res.partial).toBe(false);
  });

  it('returns partial true when no team exists', async () => {
    const res = await teamScoreForDay('nobody', 1, 6);
    expect(res.partial).toBe(true);
  });

  it('treats in-progress rounds (thru != F) as partial', async () => {
    const golfers = ['A', 'B', 'C'];
    setTeam('alice', golfers);
    setScore('A', 1, '34');
    setThru('A', 1, '9');  // in progress
    setScore('B', 1, '68');
    setThru('B', 1, 'F');  // complete
    setScore('C', 1, '70');
    setThru('C', 1, 'F');  // complete
    const res = await teamScoreForDay('alice', 1, 3);
    expect(res.partial).toBe(true);
  });

  it('counts all scores when all thru values are F', async () => {
    const golfers = ['A', 'B', 'C'];
    setTeam('alice', golfers);
    setScore('A', 1, '68');
    setThru('A', 1, 'F');
    setScore('B', 1, '70');
    setThru('B', 1, 'F');
    setScore('C', 1, '72');
    setThru('C', 1, 'F');
    const res = await teamScoreForDay('alice', 1, 3);
    expect(res.total).toBe(68 + 70 + 72);
    expect(res.partial).toBe(false);
  });

  it('treats thru 18 as complete', async () => {
    setTeam('alice', ['A']);
    setScore('A', 1, '68');
    setThru('A', 1, '18');
    const res = await teamScoreForDay('alice', 1, 1);
    expect(res.total).toBe(68);
    expect(res.partial).toBe(false);
  });

  it('works with no thru data (legacy scores)', async () => {
    setTeam('alice', ['A', 'B']);
    setScore('A', 1, '68');
    setScore('B', 1, '70');
    // No thru keys — legacy behavior, should treat as complete
    const res = await teamScoreForDay('alice', 1, 2);
    expect(res.total).toBe(68 + 70);
    expect(res.partial).toBe(false);
  });
});

// ── teamScoreBest2ForDay ─────────────────────────────────────────────────────

describe('teamScoreBest2ForDay', () => {
  it('picks best 2 scores', async () => {
    const golfers = ['A', 'B', 'C', 'D', 'E', 'F'];
    setTeam('bob', golfers);
    [72, 68, 75, 70, 80, 71].forEach((s, i) => setScore(golfers[i], 3, String(s)));
    const res = await teamScoreBest2ForDay('bob', 3);
    expect(res.total).toBe(68 + 70);
    expect(res.partial).toBe(false);
  });

  it('uses PENALTY for WD but does not mark partial', async () => {
    setTeam('bob', ['A', 'B', 'C']);
    setScore('A', 3, '68');
    setScore('B', 3, 'WD');
    setScore('C', 3, '72');
    const res = await teamScoreBest2ForDay('bob', 3);
    // Scores: 68, 99 (WD penalty), 72 → best 2 = 68 + 72
    expect(res.total).toBe(68 + 72);
    expect(res.partial).toBe(false);
  });

  it('marks partial for missing (non-WD) scores', async () => {
    setTeam('bob', ['A', 'B', 'C']);
    setScore('A', 3, '68');
    // B has no score, C has no score
    const res = await teamScoreBest2ForDay('bob', 3);
    expect(res.partial).toBe(true);
  });

  it('treats in-progress rounds as partial', async () => {
    setTeam('bob', ['A', 'B', 'C']);
    setScore('A', 3, '34');
    setThru('A', 3, '9');  // in progress
    setScore('B', 3, '68');
    setThru('B', 3, 'F');
    setScore('C', 3, '70');
    setThru('C', 3, 'F');
    const res = await teamScoreBest2ForDay('bob', 3);
    expect(res.partial).toBe(true);
  });

  it('picks best 2 when all rounds are complete (thru F)', async () => {
    setTeam('bob', ['A', 'B', 'C']);
    setScore('A', 3, '68');
    setThru('A', 3, 'F');
    setScore('B', 3, '75');
    setThru('B', 3, 'F');
    setScore('C', 3, '70');
    setThru('C', 3, 'F');
    const res = await teamScoreBest2ForDay('bob', 3);
    expect(res.total).toBe(68 + 70);
    expect(res.partial).toBe(false);
  });
});

// ── teamOverallScore ─────────────────────────────────────────────────────────

describe('teamOverallScore', () => {
  it('picks best 2 golfers by 4-day cumulative', async () => {
    setTeam('charlie', ['A', 'B', 'C']);
    // A: 68+70+72+74 = 284
    // B: 80+80+80+80 = 320
    // C: 69+71+73+75 = 288
    [68, 70, 72, 74].forEach((s, d) => setScore('A', d + 1, String(s)));
    [80, 80, 80, 80].forEach((s, d) => setScore('B', d + 1, String(s)));
    [69, 71, 73, 75].forEach((s, d) => setScore('C', d + 1, String(s)));

    const res = await teamOverallScore('charlie');
    expect(res.total).toBe(284 + 288);
    expect(res.best2Golfers).toEqual(['A', 'C']);
    expect(res.partial).toBe(false);
  });

  it('uses PENALTY for WD days without marking partial', async () => {
    setTeam('charlie', ['A', 'B']);
    [70, 70, 70, 70].forEach((s, d) => setScore('A', d + 1, String(s)));
    setScore('B', 1, '72');
    setScore('B', 2, 'WD');
    setScore('B', 3, 'WD');
    setScore('B', 4, 'WD');
    // B cumulative: 72 + 99 + 99 + 99 = 369
    const res = await teamOverallScore('charlie');
    expect(res.total).toBe(280 + 369);
    expect(res.partial).toBe(false);
  });

  it('marks partial when any day has in-progress thru', async () => {
    setTeam('charlie', ['A', 'B']);
    // A: days 1-3 complete, day 4 in progress
    [68, 70, 72].forEach((s, d) => {
      setScore('A', d + 1, String(s));
      setThru('A', d + 1, 'F');
    });
    setScore('A', 4, '34');
    setThru('A', 4, '9');  // in progress
    // B: all complete
    [70, 70, 70, 70].forEach((s, d) => {
      setScore('B', d + 1, String(s));
      setThru('B', d + 1, 'F');
    });
    const res = await teamOverallScore('charlie');
    expect(res.partial).toBe(true);
  });

  it('not partial when all thru values are F', async () => {
    setTeam('charlie', ['A', 'B']);
    [68, 70, 72, 74].forEach((s, d) => {
      setScore('A', d + 1, String(s));
      setThru('A', d + 1, 'F');
    });
    [70, 70, 70, 70].forEach((s, d) => {
      setScore('B', d + 1, String(s));
      setThru('B', d + 1, 'F');
    });
    const res = await teamOverallScore('charlie');
    expect(res.total).toBe(284 + 280);
    expect(res.partial).toBe(false);
  });
});

// ── allSelectedScoresForDay ──────────────────────────────────────────────────

describe('allSelectedScoresForDay', () => {
  it('returns entries and expected count', async () => {
    setTeam('alice', ['A', 'B']);
    setTeam('bob', ['C', 'D']);
    setScore('A', 1, '68');
    setScore('B', 1, '70');
    setScore('C', 1, '72');
    setScore('D', 1, '74');

    const { entries, expected } = await allSelectedScoresForDay(['alice', 'bob'], 1);
    expect(entries).toHaveLength(4);
    expect(expected).toBe(4);
  });

  it('excludes WD from entries and expected count', async () => {
    setTeam('alice', ['A', 'B']);
    setScore('A', 1, '68');
    setScore('B', 1, 'WD');

    const { entries, expected } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(1);
    expect(expected).toBe(1); // WD golfer not expected
  });

  it('counts missing scores toward expected (partial detection) [bug 3 fix]', async () => {
    setTeam('alice', ['A', 'B']);
    setScore('A', 1, '68');
    // B has no score yet (null) — should be expected but not in entries

    const { entries, expected } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(1);
    expect(expected).toBe(2); // both non-WD golfers expected
  });

  it('includes WC picks', async () => {
    setTeam('alice', ['A']);
    store['wc:alice'] = 'WC_Pick';
    setScore('A', 1, '68');
    setScore('WC_Pick', 1, '65');

    const { entries } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(2);
    const wcEntry = entries.find((e) => e.isWC);
    expect(wcEntry.golfer).toBe('WC_Pick');
    expect(wcEntry.score).toBe(65);
  });

  it('includes in-progress golfers in entries and marks partial', async () => {
    setTeam('alice', ['A', 'B']);
    setScore('A', 1, '68');
    setThru('A', 1, 'F');
    setScore('B', 1, '34');
    setThru('B', 1, '9');  // in progress

    const { entries, expected, partial } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(2);  // both included
    expect(expected).toBe(2);
    expect(partial).toBe(true);
  });

  it('includes all golfers when all rounds complete', async () => {
    setTeam('alice', ['A', 'B']);
    setScore('A', 1, '68');
    setThru('A', 1, 'F');
    setScore('B', 1, '72');
    setThru('B', 1, 'F');

    const { entries, expected } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(2);
    expect(expected).toBe(2);
  });

  it('includes in-progress WC picks in entries', async () => {
    setTeam('alice', ['A']);
    store['wc:alice'] = 'WC_Pick';
    setScore('A', 1, '68');
    setThru('A', 1, 'F');
    setScore('WC_Pick', 1, '32');
    setThru('WC_Pick', 1, '8');  // in progress

    const { entries, partial } = await allSelectedScoresForDay(['alice'], 1);
    expect(entries).toHaveLength(2);
    expect(partial).toBe(true);
  });
});

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

import { determineBetWinner, computeWCDailyResult, computeWCResult, computeLeaderboard } from '../services/betting.js';

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

beforeEach(() => clearStore());

// ── determineBetWinner ───────────────────────────────────────────────────────

describe('determineBetWinner', () => {
  it('identifies a single winner', () => {
    const result = determineBetWinner({ alice: 136, bob: 140, charlie: 142 });
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('alice');
    expect(result.losers).toEqual(['bob', 'charlie']);
  });

  it('identifies a two-way tie', () => {
    const result = determineBetWinner({ alice: 136, bob: 136, charlie: 142 });
    expect(result.type).toBe('two_way_tie');
    expect(result.winners).toEqual(['alice', 'bob']);
    expect(result.losers).toEqual(['charlie']);
  });

  it('identifies a three-way tie', () => {
    const result = determineBetWinner({ alice: 136, bob: 136, charlie: 136 });
    expect(result.type).toBe('three_way_tie');
  });

  it('returns pending when all scores are null', () => {
    const result = determineBetWinner({ alice: null, bob: null, charlie: null });
    expect(result.type).toBe('pending');
  });

  it('ignores null scores and picks winner from valid ones', () => {
    const result = determineBetWinner({ alice: 136, bob: null, charlie: 140 });
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('alice');
  });
});

// ── computeLeaderboard day gating ────────────────────────────────────────────

describe('computeLeaderboard — daily winners only show once the day is over', () => {
  const users = ['Mike', 'Caleb'];

  // Two teams of 6, each golfer with a numeric Day 1 score. Mike's total is
  // lower, so once Day 1 is closed he wins it.
  function seedFullDay1() {
    setTeam('Mike', ['A', 'B', 'C', 'D', 'E', 'F']);
    setTeam('Caleb', ['G', 'H', 'I', 'J', 'K', 'L']);
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F']) setScore(g, 1, '70');
    for (const g of ['G', 'H', 'I', 'J', 'K', 'L']) setScore(g, 1, '72');
  }

  it('keeps Day 1 pending while status is still day1, even with every score in', async () => {
    seedFullDay1();
    const lb = await computeLeaderboard(users, { status: 'day1' });
    expect(lb.day1.type).toBe('pending');
    expect(lb.day1.winner).toBeUndefined();
    // Scores are still computed so live standings remain visible elsewhere.
    expect(lb.day1.scores).toEqual({ Mike: 420, Caleb: 432 });
  });

  it('declares the Day 1 winner once the tournament advances to Day 2', async () => {
    seedFullDay1();
    const lb = await computeLeaderboard(users, { status: 'day2' });
    expect(lb.day1.type).toBe('winner');
    expect(lb.day1.winner).toBe('Mike');
    // Day 2 (now the active day) is still pending.
    expect(lb.day2.type).toBe('pending');
  });

  it('does not declare a Day 1 winner from the subset of teams that finished first', async () => {
    // Only Mike's team has posted; Caleb's is still blank (in progress).
    setTeam('Mike', ['A', 'B', 'C', 'D', 'E', 'F']);
    setTeam('Caleb', ['G', 'H', 'I', 'J', 'K', 'L']);
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F']) setScore(g, 1, '70');
    const lb = await computeLeaderboard(users, { status: 'day1' });
    expect(lb.day1.type).toBe('pending');
  });
});

// ── computeWCDailyResult ─────────────────────────────────────────────────────

describe('computeWCDailyResult', () => {
  it('returns pending when no scores exist', async () => {
    setTeam('alice', ['A', 'B']);
    setTeam('bob', ['C', 'D']);
    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('pending');
  });

  it('returns pending when scores are incomplete [bug 3 fix]', async () => {
    setTeam('alice', ['A', 'B']);
    setTeam('bob', ['C', 'D']);
    // Only A has a score
    setScore('A', 1, '65');
    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('pending');
  });

  it('returns no_wc_winner when a drafted golfer has lowest score', async () => {
    setTeam('alice', ['A', 'B']);
    setTeam('bob', ['C', 'D']);
    setScore('A', 1, '65');
    setScore('B', 1, '70');
    setScore('C', 1, '72');
    setScore('D', 1, '74');
    // No WC picks, all drafted — lowest is a drafted golfer
    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('no_wc_winner');
    expect(result.minScore).toBe(65);
  });

  it('returns winner when a WC pick has the sole lowest score', async () => {
    setTeam('alice', ['A']);
    setTeam('bob', ['B']);
    store['wc:alice'] = 'WC_A';
    store['wc:bob'] = 'WC_B';
    setScore('A', 1, '70');
    setScore('B', 1, '72');
    setScore('WC_A', 1, '65'); // lowest!
    setScore('WC_B', 1, '71');

    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('winner');
    expect(result.wcWinners).toEqual(['alice']);
    expect(result.losers).toEqual(['bob']);
  });

  it('returns two_way_tie when two WC picks tie for lowest', async () => {
    setTeam('alice', ['A']);
    setTeam('bob', ['B']);
    setTeam('charlie', ['C']);
    store['wc:alice'] = 'WC_A';
    store['wc:bob'] = 'WC_B';
    store['wc:charlie'] = 'WC_C';
    setScore('A', 1, '72');
    setScore('B', 1, '73');
    setScore('C', 1, '74');
    setScore('WC_A', 1, '65');
    setScore('WC_B', 1, '65');
    setScore('WC_C', 1, '70');

    const result = await computeWCDailyResult(['alice', 'bob', 'charlie'], 1);
    expect(result.type).toBe('two_way_tie');
    expect(result.wcWinners.sort()).toEqual(['alice', 'bob']);
    expect(result.losers).toEqual(['charlie']);
  });

  it('returns no_wc_winner when drafted golfer ties with WC pick', async () => {
    setTeam('alice', ['A']);
    setTeam('bob', ['B']);
    store['wc:alice'] = 'WC_A';
    setScore('A', 1, '70');
    setScore('B', 1, '65'); // drafted, ties with WC
    setScore('WC_A', 1, '65');

    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('no_wc_winner');
  });

  it('returns three_way_tie when all WC picks tie', async () => {
    setTeam('alice', ['A']);
    setTeam('bob', ['B']);
    setTeam('charlie', ['C']);
    store['wc:alice'] = 'WC_A';
    store['wc:bob'] = 'WC_B';
    store['wc:charlie'] = 'WC_C';
    setScore('A', 1, '72');
    setScore('B', 1, '73');
    setScore('C', 1, '74');
    setScore('WC_A', 1, '65');
    setScore('WC_B', 1, '65');
    setScore('WC_C', 1, '65');

    const result = await computeWCDailyResult(['alice', 'bob', 'charlie'], 1);
    expect(result.type).toBe('three_way_tie');
  });

  it('excludes WD golfers from consideration', async () => {
    setTeam('alice', ['A']);
    setTeam('bob', ['B']);
    setScore('A', 1, '70');
    setScore('B', 1, 'WD');
    // Only A has a valid score, B is WD so expected=1, entries=1
    const result = await computeWCDailyResult(['alice', 'bob'], 1);
    expect(result.type).toBe('no_wc_winner');
  });
});

// ── computeWCResult (tournament WC) ──────────────────────────────────────────

describe('computeWCResult', () => {
  it('returns unresolved when no players exist', async () => {
    const result = await computeWCResult(['alice', 'bob']);
    expect(result.resolved).toBe(false);
  });

  it('identifies WC winner when their pick wins the tournament', async () => {
    store['tournament:players'] = [{ name: 'Tiger' }, { name: 'Rory' }, { name: 'Scottie' }];
    store['wc:alice'] = 'Tiger';
    store['wc:bob'] = 'Rory';

    // Tiger: 68*4 = 272, Rory: 72*4 = 288, Scottie: 70*4 = 280
    for (let d = 1; d <= 4; d++) {
      setScore('Tiger', d, '68');
      setScore('Rory', d, '72');
      setScore('Scottie', d, '70');
    }

    const result = await computeWCResult(['alice', 'bob']);
    expect(result.resolved).toBe(true);
    expect(result.tournamentWinners).toEqual(['Tiger']);
    expect(result.wcWinners).toEqual(['alice']);
  });

  it('no WC winners when nobody picked the tournament winner', async () => {
    store['tournament:players'] = [{ name: 'Tiger' }, { name: 'Rory' }];
    store['wc:alice'] = 'Rory';

    for (let d = 1; d <= 4; d++) {
      setScore('Tiger', d, '68');
      setScore('Rory', d, '72');
    }

    const result = await computeWCResult(['alice']);
    expect(result.resolved).toBe(true);
    expect(result.tournamentWinners).toEqual(['Tiger']);
    expect(result.wcWinners).toEqual([]);
  });
});

import { countGreenJackets, computeMissedCutResult } from '../services/betting.js';

// ── computeMissedCutResult ──────────────────────────────────────────────────

describe('computeMissedCutResult', () => {
  it('returns unresolved when no picks exist', async () => {
    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(false);
  });

  it('never resolves for a no-cut event, even with picks and CUT stamps', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day3', noCut: true };
    setScore('Lowry', 2, 'CUT');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(false);
    expect(result.picks).toEqual({});
  });

  it('returns unresolved when cut has not been made yet (pre-day3)', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day2' };
    setScore('Cantlay', 1, '72');
    setScore('Lowry', 1, '74');
    setScore('Thomas', 1, '71');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(false);
  });

  it('resolves with single winner when one golfer misses the cut', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day3' };
    setScore('Cantlay', 1, '72');
    setScore('Cantlay', 2, '74');
    setScore('Lowry', 1, '80');
    setScore('Lowry', 2, 'CUT');
    setScore('Thomas', 1, '70');
    setScore('Thomas', 2, '71');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(true);
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('Caleb');
    expect(result.losers).toEqual(['Mike', 'Marshall']);
    expect(result.payout).toBe('+$10');
  });

  it('resolves with two-way tie when two golfers miss the cut', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    setScore('Cantlay', 2, 'CUT');
    setScore('Lowry', 2, 'CUT');
    setScore('Thomas', 1, '70');
    setScore('Thomas', 2, '71');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(true);
    expect(result.type).toBe('two_way_tie');
    expect(result.winners).toEqual(['Mike', 'Caleb']);
    expect(result.losers).toEqual(['Marshall']);
  });

  it('resolves as three-way tie when all golfers miss the cut', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    setScore('Cantlay', 2, 'CUT');
    setScore('Lowry', 2, 'CUT');
    setScore('Thomas', 2, 'CUT');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(true);
    expect(result.type).toBe('three_way_tie');
    expect(result.payout).toContain('No payout');
  });

  it('resolves as no_winner when no golfer missed the cut (day3+)', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day3' };
    setScore('Cantlay', 1, '70');
    setScore('Cantlay', 2, '71');
    setScore('Lowry', 1, '69');
    setScore('Lowry', 2, '72');
    setScore('Thomas', 1, '68');
    setScore('Thomas', 2, '70');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(true);
    expect(result.type).toBe('no_winner');
    expect(result.winners).toEqual([]);
  });

  it('resolves early when CUT scores appear even before day3 status', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day2' };
    setScore('Lowry', 2, 'CUT');

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.resolved).toBe(true);
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('Caleb');
  });

  it('flags a missed cut by R1+R2 score even without a CUT marker', async () => {
    store['missedcut:picks'] = { Mike: 'Cantlay', Caleb: 'Lowry', Marshall: 'Thomas' };
    store['tournament:meta'] = { status: 'day3', par: 70 };
    setScore('Cantlay', 1, '70'); setScore('Cantlay', 2, '71'); // +1, made
    setScore('Lowry', 1, '76'); setScore('Lowry', 2, '78');     // +14, missed
    setScore('Thomas', 1, '69'); setScore('Thomas', 2, '70');   // -1, made

    const result = await computeMissedCutResult(['Mike', 'Caleb', 'Marshall']);
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('Caleb');
    expect(result.details.Caleb).toEqual({ golfer: 'Lowry', missed: true });
    expect(result.details.Mike).toEqual({ golfer: 'Cantlay', missed: false });
  });

  it('does not flag a made-cut golfer whose R1+R2 is under the line', async () => {
    // Mirrors the Dustin Johnson case: +3 to par over two rounds, no CUT marker.
    store['missedcut:picks'] = { Mike: 'Smith', Marshall: 'Johnson', Caleb: 'Koivun' };
    store['tournament:meta'] = { status: 'day3', par: 70 };
    setScore('Smith', 1, '75'); setScore('Smith', 2, '71');     // +6, missed
    setScore('Johnson', 1, '66'); setScore('Johnson', 2, '77'); // +3, made
    setScore('Koivun', 1, '72'); setScore('Koivun', 2, '71');   // +3, made

    const result = await computeMissedCutResult(['Mike', 'Marshall', 'Caleb']);
    expect(result.type).toBe('winner');
    expect(result.winner).toBe('Mike');
    expect(result.losers).toEqual(['Marshall', 'Caleb']);
    expect(result.details.Marshall.missed).toBe(false);
  });
});

// ── countGreenJackets ───────────────────────────────────────────────────────

describe('countGreenJackets', () => {
  it('returns all zeros when no bets are resolved', () => {
    const lb = {
      day1: { type: 'pending' },
      day2: { type: 'pending' },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('awards one jacket for a sole winner', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Mike' },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 0, Marshall: 0,
    });
  });

  it('awards jackets to both players in a two-way tie', () => {
    const lb = {
      day1: { type: 'two_way_tie', winners: ['Mike', 'Caleb'] },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 1, Marshall: 0,
    });
  });

  it('awards no jackets for a three-way tie', () => {
    const lb = {
      day1: { type: 'three_way_tie', winners: ['Mike', 'Caleb', 'Marshall'] },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('counts WC daily winners', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'winner', wcWinners: ['Mike'] },
        day2: { type: 'no_wc_winner' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 0, Marshall: 0,
    });
  });

  it('counts WC daily two-way tie winners', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'two_way_tie', wcWinners: ['Mike', 'Caleb'] },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 1, Marshall: 0,
    });
  });

  it('counts WC tournament winner', () => {
    const lb = {
      wcDaily: {},
      wc: { resolved: true, wcWinners: ['Marshall'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 1,
    });
  });

  it('skips WC daily three-way ties', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'three_way_tie' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('accumulates across multiple bets correctly', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Mike' },
      day2: { type: 'winner', winner: 'Mike' },
      day3: { type: 'two_way_tie', winners: ['Mike', 'Caleb'] },
      day4: { type: 'winner', winner: 'Caleb' },
      overall: { type: 'winner', winner: 'Marshall' },
      wcDaily: {
        day1: { type: 'winner', wcWinners: ['Marshall'] },
        day2: { type: 'no_wc_winner' },
        day3: { type: 'pending' },
      },
      wc: { resolved: true, wcWinners: ['Marshall'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 3, Caleb: 2, Marshall: 3,
    });
  });

  it('handles mixed pending and resolved bets', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Caleb' },
      day2: { type: 'pending' },
      wcDaily: {
        day1: { type: 'pending' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 1, Marshall: 0,
    });
  });

  it('counts missed cut winner', () => {
    const lb = {
      wcDaily: {},
      wc: { resolved: false },
      missedCut: { resolved: true, type: 'winner', winner: 'Caleb', winners: ['Caleb'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 1, Marshall: 0,
    });
  });

  it('counts missed cut two-way tie winners', () => {
    const lb = {
      wcDaily: {},
      wc: { resolved: false },
      missedCut: { resolved: true, type: 'two_way_tie', winners: ['Mike', 'Marshall'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 0, Marshall: 1,
    });
  });

  it('does not count missed cut no_winner or three_way_tie', () => {
    const lb = {
      wcDaily: {},
      wc: { resolved: false },
      missedCut: { resolved: true, type: 'no_winner', winners: [] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });
});

import { get, mget, getJSON } from './redis.js';
import {
  teamScoreForDay,
  teamScoreBest2ForDay,
  teamOverallScore,
  allGolfersCumulative,
  countMaxWDs,
  encodeKey,
  allSelectedScoresForDay,
} from './scoring.js';

export async function computeMissedCutResult(users) {
  const picks = await getJSON('missedcut:picks');
  if (!picks || Object.keys(picks).length === 0) return { resolved: false, picks: {} };

  // Check each picked golfer for CUT status across all 4 days
  const pickedGolfers = Object.values(picks);
  const scoreKeys = [];
  for (const golfer of pickedGolfers) {
    const key = encodeKey(golfer);
    for (let d = 1; d <= 4; d++) {
      scoreKeys.push(`scores:${key}:day${d}`);
    }
  }
  const scoreValues = scoreKeys.length ? await mget(...scoreKeys) : [];

  // Determine which golfers missed the cut
  const golferCut = {};
  let idx = 0;
  for (const golfer of pickedGolfers) {
    const dayScores = scoreValues.slice(idx, idx + 4);
    golferCut[golfer] = dayScores.some((v) => v === 'CUT');
    idx += 4;
  }

  // Check if the cut has actually been made (at least one golfer in the tournament has CUT,
  // or we're past day2). If no golfer anywhere has CUT scores yet, bet is still pending.
  const anyCutMade = Object.values(golferCut).some((v) => v);
  if (!anyCutMade) {
    // Check tournament status — if day3+, cut is made but none of our picks missed
    const meta = await getJSON('tournament:meta');
    const statusOrder = ['setup', 'drafting', 'wc_selection', 'day1', 'day2', 'day3', 'day4', 'complete'];
    const currentIdx = statusOrder.indexOf(meta?.status || 'setup');
    if (currentIdx < statusOrder.indexOf('day3')) {
      return { resolved: false, picks };
    }
    // Past day2 and no picked golfer has CUT — no winner
    return {
      resolved: true,
      picks,
      type: 'no_winner',
      winners: [],
      losers: users.filter((u) => picks[u]),
      payout: 'No payout — no picked golfer missed the cut',
    };
  }

  // Bet is resolved — determine winners and losers
  const winners = [];
  const losers = [];
  for (const user of users) {
    if (!picks[user]) continue;
    if (golferCut[picks[user]]) {
      winners.push(user);
    } else {
      losers.push(user);
    }
  }

  if (winners.length === users.length || (winners.length > 0 && losers.length === 0)) {
    return {
      resolved: true, picks, type: 'three_way_tie',
      winners, losers: [], payout: 'No payout — all picked golfers missed the cut',
    };
  }

  if (winners.length === 1) {
    return {
      resolved: true, picks, type: 'winner',
      winner: winners[0], winners, losers,
      payout: `+$${losers.length * 5}`,
    };
  }

  if (winners.length === 2) {
    return {
      resolved: true, picks, type: 'two_way_tie',
      winners, losers,
      payout: `${winners.join(' & ')} each collect $5 from ${losers[0]}`,
    };
  }

  return { resolved: true, picks, type: 'no_winner', winners: [], losers: users, payout: 'No payout' };
}

export function determineBetWinner(scores) {
  const players = Object.keys(scores);
  const validScores = players.filter((p) => scores[p] !== null);
  if (validScores.length === 0) return { type: 'pending' };

  const minScore = Math.min(...validScores.map((p) => scores[p]));
  const winners = validScores.filter((p) => scores[p] === minScore);
  const losers = players.filter((p) => !winners.includes(p));

  if (winners.length === 1) {
    return { type: 'winner', winner: winners[0], losers, payout: `+$${losers.length * 5}` };
  } else if (winners.length === 2) {
    const loser = losers[0];
    return {
      type: 'two_way_tie',
      winners,
      losers,
      payout: loser ? `${winners.join(' & ')} each collect $5 from ${loser}` : 'Tie',
    };
  } else {
    return { type: 'three_way_tie', winners: players, payout: 'No payout — three-way tie' };
  }
}

export async function computeLeaderboard(users, meta) {
  const status = meta?.status || 'setup';
  const result = {};

  const statusOrder = ['setup', 'drafting', 'wc_selection', 'day1', 'day2', 'day3', 'day4', 'complete'];
  const currentIdx = statusOrder.indexOf(status);

  const dayDefs = [
    { key: 'day1', n: 1, useAll6: true, minStatusIdx: statusOrder.indexOf('day1') },
    { key: 'day2', n: 2, useAll6: true, minStatusIdx: statusOrder.indexOf('day2') },
    { key: 'day3', n: 3, useAll6: false, minStatusIdx: statusOrder.indexOf('day3') },
    { key: 'day4', n: 4, useAll6: false, minStatusIdx: statusOrder.indexOf('day4') },
  ];

  for (const { key, n, useAll6, minStatusIdx } of dayDefs) {
    if (currentIdx < minStatusIdx) continue;

    if (useAll6) {
      // Days 1 & 2: compute bestN based on max WDs across all teams
      const teamGolfers = {};
      const allKeys = [];
      for (const user of users) {
        const golfers = await getJSON(`teams:${user}`) || [];
        teamGolfers[user] = golfers;
        for (const golfer of golfers) {
          allKeys.push(`scores:${encodeKey(golfer)}:day${n}`);
        }
      }
      const allValues = allKeys.length ? await mget(...allKeys) : [];
      const teamRawScores = {};
      let vi = 0;
      for (const user of users) {
        teamRawScores[user] = allValues.slice(vi, vi + teamGolfers[user].length);
        vi += teamGolfers[user].length;
      }
      const maxWDs = countMaxWDs(teamRawScores);
      const bestN = 6 - maxWDs;

      const scores = {};
      let anyPartial = false;
      for (const user of users) {
        const res = await teamScoreForDay(user, n, bestN);
        scores[user] = res.partial ? null : res.total;
        if (res.partial) anyPartial = true;
      }
      result[key] = { scores, partial: anyPartial, bestN, rounds: bestN, ...determineBetWinner(scores) };
    } else {
      // Days 3 & 4: best 2, unchanged
      const scores = {};
      let anyPartial = false;
      for (const user of users) {
        const res = await teamScoreBest2ForDay(user, n);
        scores[user] = res.partial ? null : res.total;
        if (res.partial) anyPartial = true;
      }
      result[key] = { scores, partial: anyPartial, rounds: 2, ...determineBetWinner(scores) };
    }
  }

  // Overall available once day3 has started (meaningful after day 4, but show early)
  if (currentIdx >= statusOrder.indexOf('day3')) {
    const overallScores = {};
    let anyPartial = false;
    for (const user of users) {
      const res = await teamOverallScore(user);
      overallScores[user] = res.partial ? null : res.total;
      if (res.partial) anyPartial = true;
    }
    // Overall = best 2 cumulative across all 4 days → 8 round-scores per team.
    result.overall = { scores: overallScores, partial: anyPartial, rounds: 8, ...determineBetWinner(overallScores) };
  }

  // WC daily side bet (days 1-4 only, reuse dayDefs loop)
  result.wcDaily = {};
  for (const { key, n, minStatusIdx } of dayDefs) {
    if (currentIdx < minStatusIdx) continue;
    result.wcDaily[key] = await computeWCDailyResult(users, n);
  }

  // WC result available when complete
  if (status === 'complete') {
    result.wc = await computeWCResult(users);
  } else {
    // Show WC picks even before complete
    const wcPicks = {};
    for (const user of users) {
      wcPicks[user] = await get(`wc:${user}`);
    }
    result.wc = { wcPicks, resolved: false };
  }

  // Missed cut side bet
  result.missedCut = await computeMissedCutResult(users);

  return result;
}

export async function computeWCDailyResult(users, dayN) {
  const { entries, expected, partial } = await allSelectedScoresForDay(users, dayN);
  if (entries.length === 0) return { type: 'pending' };
  // Pending if golfers haven't started at all (no score data)
  if (entries.length < expected) return { type: 'pending' };

  const minScore = Math.min(...entries.map((e) => e.score));
  const atMin = entries.filter((e) => e.score === minScore);

  // If any drafted golfer ties at the min, no WC payout
  if (atMin.some((e) => !e.isWC)) {
    const wcEntries = entries.filter((e) => e.isWC);
    const lowestWC = wcEntries.length > 0
      ? wcEntries.reduce((a, b) => a.score < b.score ? a : b)
      : null;
    return {
      type: 'no_wc_winner', minScore, lowGolfers: atMin.map((e) => e.golfer), partial,
      lowestWC: lowestWC ? { golfer: lowestWC.golfer, score: lowestWC.score, owner: lowestWC.owner } : null,
    };
  }

  // All golfers at the min are WC picks
  const wcWinners = [...new Set(atMin.map((e) => e.owner))];
  const losers = users.filter((u) => !wcWinners.includes(u));

  if (wcWinners.length === users.length) {
    return { type: 'three_way_tie', partial };
  }

  return {
    type: wcWinners.length === 1 ? 'winner' : 'two_way_tie',
    wcWinners,
    losers,
    partial,
  };
}

export async function computeWCResult(users) {
  const cumulative = await allGolfersCumulative();
  if (Object.keys(cumulative).length === 0) return { resolved: false };

  const minScore = Math.min(...Object.values(cumulative));
  const tournamentWinners = Object.keys(cumulative).filter((g) => cumulative[g] === minScore);

  const wcPicks = {};
  const wcWinners = [];
  for (const user of users) {
    const wc = await get(`wc:${user}`);
    wcPicks[user] = wc;
    if (wc && tournamentWinners.includes(wc)) wcWinners.push(user);
  }

  return {
    resolved: true,
    tournamentWinners,
    wcPicks,
    wcWinners,
    payouts: wcWinners.map((w) => ({
      winner: w,
      losers: users.filter((u) => u !== w),
      amount: 20,
    })),
  };
}

export function countGreenJackets(leaderboard, users) {
  const counts = {};
  for (const user of users) counts[user] = 0;

  // Daily bets: day1, day2, day3, day4, overall
  const betKeys = ['day1', 'day2', 'day3', 'day4', 'overall'];
  for (const key of betKeys) {
    const bet = leaderboard[key];
    if (!bet) continue;
    if (bet.type === 'winner') {
      if (counts[bet.winner] !== undefined) counts[bet.winner]++;
    } else if (bet.type === 'two_way_tie') {
      for (const w of bet.winners) {
        if (counts[w] !== undefined) counts[w]++;
      }
    }
  }

  // WC daily bets
  const wcDaily = leaderboard.wcDaily || {};
  for (const key of Object.keys(wcDaily)) {
    const wd = wcDaily[key];
    if (!wd || !wd.wcWinners) continue;
    if (wd.type === 'winner' || wd.type === 'two_way_tie') {
      for (const w of wd.wcWinners) {
        if (counts[w] !== undefined) counts[w]++;
      }
    }
  }

  // WC tournament
  const wc = leaderboard.wc;
  if (wc?.resolved && wc.wcWinners) {
    for (const w of wc.wcWinners) {
      if (counts[w] !== undefined) counts[w]++;
    }
  }

  // Missed cut
  const mc = leaderboard.missedCut;
  if (mc?.resolved && mc.type !== 'no_winner' && mc.type !== 'three_way_tie') {
    const mcWinners = mc.type === 'winner' ? [mc.winner] : mc.winners || [];
    for (const w of mcWinners) {
      if (counts[w] !== undefined) counts[w]++;
    }
  }

  return counts;
}


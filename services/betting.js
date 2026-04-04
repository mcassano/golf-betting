import { get, getJSON } from './redis.js';
import {
  teamScoreForDay,
  teamScoreBest2ForDay,
  teamOverallScore,
  allGolfersCumulative,
} from './scoring.js';

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
    const scores = {};
    let anyPartial = false;
    for (const user of users) {
      const res = useAll6
        ? await teamScoreForDay(user, n)
        : await teamScoreBest2ForDay(user, n);
      scores[user] = res.partial ? null : res.total;
      if (res.partial) anyPartial = true;
    }
    result[key] = { scores, partial: anyPartial, ...determineBetWinner(scores) };
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
    result.overall = { scores: overallScores, partial: anyPartial, ...determineBetWinner(overallScores) };
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

  return result;
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

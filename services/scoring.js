import { get, mget, getJSON } from './redis.js';

const PENALTY = 99;

export function isWD(raw) {
  return raw === 'WD';
}

export function resolveScore(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'WD') return null;
  if (raw === 'CUT') return PENALTY;
  const n = parseInt(raw, 10);
  return isNaN(n) ? PENALTY : n;
}

// Pure scoring: given array of raw score strings, compute best-N total excluding WDs.
export function bestNScore(rawScores, bestN) {
  const scores = [];
  let partial = false;

  for (const raw of rawScores) {
    if (isWD(raw)) continue;
    const score = resolveScore(raw);
    if (score === null) {
      partial = true;
    } else {
      scores.push(score);
    }
  }

  // If bestN dropped to 0 (all 6 WD) or we have no valid scores,
  // treat as partial — there's nothing meaningful to sum.
  if (bestN <= 0 || scores.length === 0) {
    return { total: 0, partial: true };
  }

  scores.sort((a, b) => a - b);
  const take = Math.min(bestN, scores.length);
  const total = scores.slice(0, take).reduce((sum, s) => sum + s, 0);

  return { total, partial };
}

// Day 1 & 2: best N golfers (N defaults to 6, reduced when WDs exist)
export async function teamScoreForDay(player, dayN, bestN = 6) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };
  const keys = golfers.map((g) => `scores:${encodeKey(g)}:day${dayN}`);
  const rawScores = await mget(...keys);
  return bestNScore(rawScores, bestN);
}

// Day 3 & 4: sum of best 2 golfers that day
export async function teamScoreBest2ForDay(player, dayN) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };
  const keys = golfers.map((g) => `scores:${encodeKey(g)}:day${dayN}`);
  const rawValues = await mget(...keys);
  const scores = [];
  let partial = false;
  for (const raw of rawValues) {
    const score = resolveScore(raw);
    if (score === null) {
      if (!isWD(raw)) partial = true;
      scores.push(PENALTY);
    } else {
      scores.push(score);
    }
  }
  scores.sort((a, b) => a - b);
  return { total: scores[0] + scores[1], partial };
}

// Overall: best 2 golfers by cumulative 4-day total
export async function teamOverallScore(player) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };

  // Fetch all 4 days for all golfers in one MGET
  const keys = [];
  for (const golfer of golfers) {
    const k = encodeKey(golfer);
    for (let day = 1; day <= 4; day++) keys.push(`scores:${k}:day${day}`);
  }
  const values = await mget(...keys);

  const cumulative = [];
  let partial = false;
  let i = 0;
  for (const golfer of golfers) {
    let cum = 0;
    for (let day = 1; day <= 4; day++) {
      const raw = values[i++];
      const score = resolveScore(raw);
      if (score === null) {
        if (!isWD(raw)) partial = true;
        cum += PENALTY;
      } else {
        cum += score;
      }
    }
    cumulative.push({ golfer, total: cum });
  }
  cumulative.sort((a, b) => a.total - b.total);
  const best2 = cumulative.slice(0, 2);
  return {
    total: best2[0].total + best2[1].total,
    best2Golfers: best2.map((x) => x.golfer),
    partial,
  };
}

// Used for WC tournament winner computation
export async function allGolfersCumulative() {
  const allGolfers = await getJSON('tournament:players');
  if (!allGolfers) return {};

  // Fetch all scores in one MGET
  const keys = [];
  for (const g of allGolfers) {
    const k = encodeKey(g.name);
    for (let day = 1; day <= 4; day++) keys.push(`scores:${k}:day${day}`);
  }
  const values = await mget(...keys);

  const result = {};
  let i = 0;
  for (const g of allGolfers) {
    let cum = 0;
    for (let day = 1; day <= 4; day++) {
      const raw = values[i++];
      const score = resolveScore(raw);
      cum += score === null ? PENALTY : score;
    }
    result[g.name] = cum;
  }
  return result;
}

// Count the max number of WD golfers on any single team.
// teams: { userName: [rawScore1, rawScore2, ...], ... }
export function countMaxWDs(teams) {
  let max = 0;
  for (const rawScores of Object.values(teams)) {
    const wds = rawScores.filter((raw) => isWD(raw)).length;
    if (wds > max) max = wds;
  }
  return max;
}

// All selected golfers' individual scores for a given day (drafted + WC).
// WD golfers are excluded (resolveScore returns null for WD).
// Returns { entries, expected } so callers can detect incomplete data.
export async function allSelectedScoresForDay(users, dayN) {
  // Gather teams and WC picks
  const teams = {};
  const wcPicks = {};
  for (const user of users) {
    teams[user] = await getJSON(`teams:${user}`) || [];
    wcPicks[user] = await get(`wc:${user}`);
  }

  // Build all score keys and fetch in one MGET
  const lookups = []; // { user, golfer, isWC }
  const scoreKeys = [];
  for (const user of users) {
    for (const golfer of teams[user]) {
      lookups.push({ user, golfer, isWC: false });
      scoreKeys.push(`scores:${encodeKey(golfer)}:day${dayN}`);
    }
    if (wcPicks[user]) {
      lookups.push({ user, golfer: wcPicks[user], isWC: true });
      scoreKeys.push(`scores:${encodeKey(wcPicks[user])}:day${dayN}`);
    }
  }

  const values = scoreKeys.length ? await mget(...scoreKeys) : [];
  const entries = [];
  let expected = 0;
  for (let i = 0; i < lookups.length; i++) {
    const raw = values[i];
    if (!isWD(raw)) expected++;
    const score = resolveScore(raw);
    if (score !== null) {
      entries.push({ golfer: lookups[i].golfer, score, owner: lookups[i].user, isWC: lookups[i].isWC });
    }
  }

  return { entries, expected };
}

// Encode golfer name for use as Redis key part (replace spaces/special chars)
export function encodeKey(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

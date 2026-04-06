import { get, getJSON } from './redis.js';

const PENALTY = 80;

export function resolveScore(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'CUT' || raw === 'WD') return PENALTY;
  const n = parseInt(raw, 10);
  return isNaN(n) ? PENALTY : n;
}

// Day 1 & 2: sum of all 6 golfers
export async function teamScoreForDay(player, dayN) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };
  let total = 0;
  let partial = false;
  for (const golfer of golfers) {
    const raw = await get(`scores:${encodeKey(golfer)}:day${dayN}`);
    const score = resolveScore(raw);
    if (score === null) { partial = true; total += 0; }
    else total += score;
  }
  return { total, partial };
}

// Day 3 & 4: sum of best 2 golfers that day
export async function teamScoreBest2ForDay(player, dayN) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };
  const scores = [];
  let partial = false;
  for (const golfer of golfers) {
    const raw = await get(`scores:${encodeKey(golfer)}:day${dayN}`);
    const score = resolveScore(raw);
    if (score === null) { partial = true; scores.push(PENALTY); }
    else scores.push(score);
  }
  scores.sort((a, b) => a - b);
  return { total: scores[0] + scores[1], partial };
}

// Overall: best 2 golfers by cumulative 4-day total
export async function teamOverallScore(player) {
  const golfers = await getJSON(`teams:${player}`);
  if (!golfers) return { total: null, partial: true };
  const cumulative = [];
  let partial = false;
  for (const golfer of golfers) {
    let cum = 0;
    for (let day = 1; day <= 4; day++) {
      const raw = await get(`scores:${encodeKey(golfer)}:day${day}`);
      const score = resolveScore(raw);
      if (score === null) { partial = true; cum += PENALTY; }
      else cum += score;
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
  const result = {};
  for (const g of allGolfers) {
    let cum = 0;
    for (let day = 1; day <= 4; day++) {
      const raw = await get(`scores:${encodeKey(g.name)}:day${day}`);
      const score = resolveScore(raw);
      cum += score === null ? PENALTY : score;
    }
    result[g.name] = cum;
  }
  return result;
}

// All 21 selected golfers' individual scores for a given day (drafted + WC)
export async function allSelectedScoresForDay(users, dayN) {
  const entries = [];

  for (const user of users) {
    const golfers = await getJSON(`teams:${user}`) || [];
    for (const golfer of golfers) {
      const raw = await get(`scores:${encodeKey(golfer)}:day${dayN}`);
      const score = resolveScore(raw);
      if (score !== null) entries.push({ golfer, score, owner: user, isWC: false });
    }

    const wc = await get(`wc:${user}`);
    if (wc) {
      const raw = await get(`scores:${encodeKey(wc)}:day${dayN}`);
      const score = resolveScore(raw);
      if (score !== null) entries.push({ golfer: wc, score, owner: user, isWC: true });
    }
  }

  return entries;
}

// Encode golfer name for use as Redis key part (replace spaces/special chars)
export function encodeKey(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

import { get, mget, getJSON } from './redis.js';
import { encodeKey, isInProgress } from './scoring.js';
import { syncScores } from './espn-sync.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let pollTimer = null;
let lastPollTime = null;
let polling = false;

/**
 * Check if we should be polling (tournament is in day1-day4).
 */
async function shouldPoll() {
  const meta = await getJSON('tournament:meta');
  if (!meta) return false;
  return ['day1', 'day2', 'day3', 'day4'].includes(meta.status);
}

/**
 * Single poll cycle.
 */
async function poll(io) {
  try {
    const active = await shouldPoll();
    if (!active) {
      console.log('[ESPN Poller] Tournament not in active day, skipping poll');
      return;
    }

    console.log(`[ESPN Poller] Polling at ${new Date().toISOString()}`);
    const result = await syncScores(io);
    lastPollTime = new Date().toISOString();
    console.log(`[ESPN Poller] Poll complete: ${result.updated} scores updated`);

    // Auto-stop once every player has a score for the current day (including
    // CUT/WD). Admin manually restarts polling for the next day.
    const meta = await getJSON('tournament:meta');
    const day = meta?.status; // 'day1'..'day4'
    if (await currentDayComplete(day)) {
      console.log(`[ESPN Poller] All ${day} scores recorded, auto-stopping`);
      stopPolling();
    }
  } catch (err) {
    console.error('[ESPN Poller] Poll error:', err.message);
  }
}

async function currentDayComplete(day) {
  if (!['day1', 'day2', 'day3', 'day4'].includes(day)) return false;
  const dayNum = parseInt(day.replace('day', ''), 10);
  const players = await getJSON('tournament:players') || [];
  if (!players.length) return false;

  // Batch all lookups: previous-day scores (for CUT/WD check) + current day score + thru
  const keys = [];
  const layout = []; // { playerIdx, type: 'prev'|'score'|'thru', day? }
  for (let pi = 0; pi < players.length; pi++) {
    const key = encodeKey(players[pi].name);
    for (let d = 1; d < dayNum; d++) {
      keys.push(`scores:${key}:day${d}`);
      layout.push({ pi, type: 'prev' });
    }
    keys.push(`scores:${key}:${day}`);
    layout.push({ pi, type: 'score' });
    keys.push(`scores:${key}:${day}:thru`);
    layout.push({ pi, type: 'thru' });
  }

  const vals = keys.length ? await mget(...keys) : [];

  // Parse batched results per player
  const playerScore = new Array(players.length).fill(undefined);
  const playerThru = new Array(players.length).fill(null);
  const eliminated = new Set();
  for (let i = 0; i < layout.length; i++) {
    const { pi, type } = layout[i];
    if (type === 'prev' && (vals[i] === 'CUT' || vals[i] === 'WD')) eliminated.add(pi);
    else if (type === 'score') playerScore[pi] = vals[i];
    else if (type === 'thru') playerThru[pi] = vals[i];
  }

  for (let pi = 0; pi < players.length; pi++) {
    if (eliminated.has(pi)) continue;
    if (playerScore[pi] === null || playerScore[pi] === undefined) return false;
    if (isInProgress(playerScore[pi], playerThru[pi])) return false;
  }
  return true;
}

/**
 * Start the polling loop.
 */
export function startPolling(io) {
  if (polling) {
    console.log('[ESPN Poller] Already polling');
    return false;
  }

  polling = true;
  console.log('[ESPN Poller] Starting polling (every 5 minutes)');

  // Do an immediate poll, then set interval
  poll(io).catch((err) => console.error('[ESPN Poller] Initial poll error:', err));
  pollTimer = setInterval(() => poll(io), POLL_INTERVAL_MS);

  return true;
}

/**
 * Stop the polling loop.
 */
export function stopPolling() {
  if (!polling) {
    console.log('[ESPN Poller] Not currently polling');
    return false;
  }

  clearInterval(pollTimer);
  pollTimer = null;
  polling = false;
  console.log('[ESPN Poller] Polling stopped');
  return true;
}

/**
 * Get current polling status.
 */
export function getPollingStatus() {
  return {
    polling,
    lastPollTime,
    intervalMs: POLL_INTERVAL_MS,
  };
}

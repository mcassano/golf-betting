import { get, getJSON } from './redis.js';
import { encodeKey } from './scoring.js';
import { syncScores } from './espn-sync.js';

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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

    // Auto-stop once every player has a day4 score recorded (including CUT/WD).
    if (await tournamentComplete()) {
      console.log('[ESPN Poller] All day4 scores recorded, auto-stopping');
      stopPolling();
    }
  } catch (err) {
    console.error('[ESPN Poller] Poll error:', err.message);
  }
}

async function tournamentComplete() {
  const players = await getJSON('tournament:players') || [];
  if (!players.length) return false;
  for (const p of players) {
    const v = await get(`scores:${encodeKey(p.name)}:day4`);
    if (v === null || v === undefined) return false;
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
  console.log('[ESPN Poller] Starting polling (every 30 minutes)');

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

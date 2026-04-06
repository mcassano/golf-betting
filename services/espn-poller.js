import { getJSON } from './redis.js';
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
  } catch (err) {
    console.error('[ESPN Poller] Poll error:', err.message);
  }
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
  poll(io);
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

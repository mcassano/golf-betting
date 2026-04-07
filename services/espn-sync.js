import { get, set, getJSON, setJSON } from './redis.js';
import { encodeKey } from './scoring.js';
import { fetchTournament, fetchScores } from './espn.js';

/**
 * syncScores(io) - Fetch scores from ESPN and write to Redis.
 * Matches ESPN players to stored players by espnId.
 * Emits scores:updated via Socket.io after updates.
 */
export async function syncScores(io, date) {
  const { players: espnPlayers } = await fetchScores(date);
  const storedPlayers = await getJSON('tournament:players');
  if (!storedPlayers) {
    console.log('[ESPN Sync] No stored players found, skipping score sync');
    return { updated: 0, skipped: 0 };
  }

  // Build a lookup: espnId -> stored player
  const espnIdToStored = {};
  for (const sp of storedPlayers) {
    if (sp.espnId) {
      espnIdToStored[sp.espnId] = sp;
    }
  }

  const lockedSet = new Set(await getJSON('scores:locked') || []);

  let updated = 0;
  let skipped = 0;

  for (const ep of espnPlayers) {
    const stored = espnIdToStored[ep.espnId];
    if (!stored) {
      skipped++;
      continue;
    }

    const key = encodeKey(stored.name);

    // Write completed round scores
    for (let day = 1; day <= 4; day++) {
      const dayKey = `day${day}`;
      const espnScore = ep.scores[dayKey];
      if (espnScore !== null) {
        // Don't overwrite admin-locked scores
        if (lockedSet.has(`${key}:${dayKey}`)) continue;
        const existing = await get(`scores:${key}:${dayKey}`);
        if (existing !== String(espnScore)) {
          await set(`scores:${key}:${dayKey}`, String(espnScore));
          updated++;
        }
      }
    }
  }

  if (updated > 0 && io) {
    io.emit('scores:updated', { source: 'espn', updated });
  }

  const meta = await getJSON('tournament:meta');
  if (meta) {
    meta.lastEspnSync = new Date().toISOString();
    await setJSON('tournament:meta', meta);
  }

  console.log(`[ESPN Sync] Scores synced: ${updated} updated, ${skipped} skipped (no match)`);
  return { updated, skipped };
}

/**
 * syncPlayers() - Fetch tournament data from ESPN and store players.
 * Returns the player list.
 */
export async function syncPlayers(date) {
  const tournament = await fetchTournament(date);

  // Merge with existing players if any (preserve wcEligible flags)
  const existingPlayers = await getJSON('tournament:players') || [];
  const existingByName = {};
  for (const p of existingPlayers) {
    existingByName[p.name] = p;
  }

  const players = tournament.players.map((ep) => {
    const existing = existingByName[ep.name];
    return {
      name: ep.name,
      espnId: ep.espnId,
      wcEligible: existing?.wcEligible || false,
    };
  });

  await setJSON('tournament:players', players);

  const meta = await getJSON('tournament:meta') || { name: tournament.eventName, status: 'setup' };
  if (!meta.name || meta.name === 'Unknown Event') {
    meta.name = tournament.eventName;
  }
  meta.espnEventId = tournament.eventId;
  await setJSON('tournament:meta', meta);

  console.log(`[ESPN Sync] Players synced: ${players.length} players`);
  return { players, eventName: tournament.eventName };
}

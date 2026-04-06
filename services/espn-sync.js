import { get, set, getJSON, setJSON } from './redis.js';
import { encodeKey } from './scoring.js';
import { fetchTournament, fetchScores } from './espn.js';

/**
 * syncScores(io) - Fetch scores from ESPN and write to Redis.
 * Matches ESPN players to stored players by espnId.
 * Emits scores:updated via Socket.io after updates.
 */
export async function syncScores(io) {
  const { players: espnPlayers } = await fetchScores();
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
        const existing = await get(`scores:${key}:${dayKey}`);
        // Don't overwrite admin-entered CUT/WD
        if (existing === 'CUT' || existing === 'WD') continue;
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

  // Store last sync time
  if (updated > 0) {
    const meta = await getJSON('tournament:meta');
    if (meta) {
      meta.lastEspnSync = new Date().toISOString();
      await setJSON('tournament:meta', meta);
    }
  }

  console.log(`[ESPN Sync] Scores synced: ${updated} updated, ${skipped} skipped (no match)`);
  return { updated, skipped };
}

/**
 * syncPlayers() - Fetch tournament data from ESPN and store players.
 * Returns the player list.
 */
export async function syncPlayers() {
  const tournament = await fetchTournament();

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

  // Store course par in tournament meta
  const meta = await getJSON('tournament:meta') || { name: tournament.eventName, status: 'setup' };
  if (tournament.coursePar) {
    meta.coursePar = tournament.coursePar;
  }
  if (!meta.name || meta.name === 'Unknown Event') {
    meta.name = tournament.eventName;
  }
  meta.espnEventId = tournament.eventId;
  await setJSON('tournament:meta', meta);

  console.log(`[ESPN Sync] Players synced: ${players.length} players, par ${tournament.coursePar || 'unknown'}`);
  return { players, eventName: tournament.eventName, coursePar: tournament.coursePar };
}

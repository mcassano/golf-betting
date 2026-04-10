import { get, set, getJSON, setJSON } from './redis.js';
import { encodeKey } from './scoring.js';
import { fetchTournament, fetchScores } from './espn.js';

/**
 * Normalize a name for fuzzy matching: strip odds suffix, remove accents,
 * collapse whitespace, lowercase.
 */
const NAME_ALIASES = {
  johnny: 'john',
};

function normalizeName(name) {
  const parts = name
    .replace(/\s\+\d+$/, '')       // strip odds suffix e.g. "+550"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toLowerCase()
    .split(/\s+/);
  parts[0] = NAME_ALIASES[parts[0]] || parts[0];
  return parts.join('');
}

/**
 * syncScores(io) - Fetch scores from ESPN and write to Redis.
 * Matches ESPN players to stored players by espnId, falling back to name matching.
 * Emits scores:updated via Socket.io after updates.
 */
export async function syncScores(io, date) {
  const { players: espnPlayers } = await fetchScores(date);
  const storedPlayers = await getJSON('tournament:players');
  if (!storedPlayers) {
    console.log('[ESPN Sync] No stored players found, skipping score sync');
    return { updated: 0, skipped: 0 };
  }

  // Build lookups: espnId -> stored player, normalized name -> stored player
  const espnIdToStored = {};
  const nameToStored = {};
  for (const sp of storedPlayers) {
    if (sp.espnId) {
      espnIdToStored[sp.espnId] = sp;
    }
    nameToStored[normalizeName(sp.name)] = sp;
  }

  const lockedSet = new Set(await getJSON('scores:locked') || []);
  let needsPlayerSave = false;

  let updated = 0;
  let skipped = 0;

  for (const ep of espnPlayers) {
    let stored = espnIdToStored[ep.espnId];
    if (!stored) {
      // Fall back to normalized name matching
      stored = nameToStored[normalizeName(ep.name)];
      if (stored) {
        // Backfill espnId for future fast lookups
        stored.espnId = ep.espnId;
        needsPlayerSave = true;
      }
    }
    if (!stored) {
      skipped++;
      continue;
    }

    const key = encodeKey(stored.name);

    // Write scores and thru data (including in-progress rounds)
    for (let day = 1; day <= 4; day++) {
      const dayKey = `day${day}`;
      const espnScore = ep.scores[dayKey];
      const espnThru = ep.thru?.[dayKey];
      const espnRelative = ep.relativeScores?.[dayKey];
      if (espnScore !== null) {
        // Don't overwrite admin-locked scores
        if (lockedSet.has(`${key}:${dayKey}`)) continue;
        const existing = await get(`scores:${key}:${dayKey}`);
        if (existing !== String(espnScore)) {
          await set(`scores:${key}:${dayKey}`, String(espnScore));
          updated++;
        }
        // Always update thru so it reflects current progress
        if (espnThru !== null && espnThru !== undefined) {
          await set(`scores:${key}:${dayKey}:thru`, String(espnThru));
        }
        // Store ESPN's relative-to-par display value (e.g. "-4", "+2", "E")
        if (espnRelative) {
          await set(`scores:${key}:${dayKey}:rel`, espnRelative);
        }
      }
    }
  }

  // Persist backfilled espnIds so future syncs match by ID
  if (needsPlayerSave) {
    await setJSON('tournament:players', storedPlayers);
    console.log('[ESPN Sync] Backfilled espnId on matched players');
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

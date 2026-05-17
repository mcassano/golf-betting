import { get, set, mget, getJSON, setJSON } from './redis.js';
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
  const meta = await getJSON('tournament:meta');
  const espnName = meta?.espnName || null;
  const { players: espnPlayers } = await fetchScores(date, espnName);
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

  // Detect and mark missed-cut players. ESPN doesn't emit a 'CUT' marker —
  // players who missed the cut simply have no day3+ data. Golf cuts happen after
  // round 2, so we only check day3: once day3 has started (any ESPN player has a
  // day3 score), any stored player with a day2 score in Redis but no day3 score
  // from ESPN missed the cut.
  const currentDayN = { day3: 3, day4: 4, complete: 4 }[meta?.status];
  if (currentDayN >= 3 && espnPlayers.some((ep) => ep.scores.day3 !== null)) {
    const batchKeys = [];
    for (const sp of storedPlayers) {
      const k = encodeKey(sp.name);
      batchKeys.push(`scores:${k}:day2`, `scores:${k}:day3`);
    }
    const vals = batchKeys.length ? await mget(...batchKeys) : [];

    for (let i = 0; i < storedPlayers.length; i++) {
      const day2Score = vals[i * 2];
      const day3Score = vals[i * 2 + 1];
      // Skip if: no day2 score, already has day3 score, or day2 was WD
      if (!day2Score || day2Score === 'WD' || day3Score !== null) continue;

      const k = encodeKey(storedPlayers[i].name);
      await set(`scores:${k}:day3`, 'CUT');
      updated++;
      const day4Existing = await get(`scores:${k}:day4`);
      if (day4Existing === null || day4Existing === undefined) {
        await set(`scores:${k}:day4`, 'CUT');
      }
    }
  }

  if (updated > 0 && io) {
    io.emit('scores:updated', { source: 'espn', updated });
  }

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
  const meta = await getJSON('tournament:meta');
  const espnName = meta?.espnName || null;
  const tournament = await fetchTournament(date, espnName);

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

  const savedMeta = meta || { name: tournament.eventName, status: 'setup' };
  if (!savedMeta.name || savedMeta.name === 'Unknown Event') {
    savedMeta.name = tournament.eventName;
  }
  savedMeta.espnEventId = tournament.eventId;
  await setJSON('tournament:meta', savedMeta);

  console.log(`[ESPN Sync] Players synced: ${players.length} players`);
  return { players, eventName: tournament.eventName };
}

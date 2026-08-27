// ESPN's edge (Akamai) 403s requests from datacenter IPs (e.g. Railway) when the
// User-Agent looks like a bare HTTP client — Node's default UA is blocked while a
// curl-style UA passes. site.web.api.espn.com serves the identical payload behind
// a laxer edge config, so it's the fallback if the primary host starts blocking.
const ESPN_SCOREBOARD_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
  'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
];
const ESPN_UA = process.env.ESPN_UA || 'curl/8.7.1';

/**
 * Fetch raw scoreboard data from ESPN, trying each host until one succeeds.
 * Optionally pass a date string (YYYYMMDD) to get a specific day.
 */
async function fetchScoreboard(date) {
  let lastErr;
  for (const base of ESPN_SCOREBOARD_URLS) {
    const url = date ? `${base}?dates=${date}` : base;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ESPN_UA },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return res.json();
      lastErr = new Error(`ESPN API returned ${res.status}: ${res.statusText}`);
      console.warn(`[ESPN] ${res.status} from ${base}, trying next host`);
    } catch (e) {
      lastErr = e;
      console.warn(`[ESPN] fetch failed for ${base}: ${e.message}`);
    }
  }
  throw lastErr;
}

/**
 * Find the right event from ESPN response, optionally matching by name.
 * Falls back to events[0] if no name given or no match found.
 */
function getEvent(data, espnName) {
  const events = data?.events || [];
  if (!events.length) return null;
  if (espnName) {
    const lower = espnName.toLowerCase();
    const match = events.find(
      (e) => e.name?.toLowerCase().includes(lower) || e.shortName?.toLowerCase().includes(lower)
    );
    if (match) return match;
    console.warn(`[ESPN] No event matched "${espnName}", falling back to events[0]`);
  }
  return events[0] || null;
}

/**
 * Extract competitors array from ESPN response.
 */
function getCompetitors(data, espnName) {
  const event = getEvent(data, espnName);
  if (!event) return [];
  const competition = event.competitions?.[0];
  if (!competition) return [];
  return competition.competitors || [];
}

/**
 * Count holes played in a linescore using the hole-by-hole scores array.
 */
function holesPlayed(linescore) {
  return linescore?.linescores?.length || 0;
}

/**
 * fetchTournament() - Setup/init mode.
 * Returns { eventName, eventId, players: [{ name, espnId }] }
 */
export async function fetchTournament(date, espnName) {
  const data = await fetchScoreboard(date);
  const event = getEvent(data, espnName);
  if (!event) {
    throw new Error('No event found in ESPN scoreboard data');
  }

  const competitors = getCompetitors(data, espnName);

  const players = competitors.map((c) => ({
    name: c.athlete?.displayName || 'Unknown',
    espnId: c.id,
  }));

  return {
    eventName: event.name || event.shortName || 'Unknown Event',
    eventId: event.id,
    players,
  };
}

/**
 * fetchScores() - Score refresh mode.
 * Returns { players: [{ espnId, name, scores: { day1, ... }, thru: { day1, ... } }] }
 * In-progress rounds return current strokes + holes played.
 * Completed rounds return final strokes + 'F'.
 */
export async function fetchScores(date, espnName) {
  const data = await fetchScoreboard(date);
  const competitors = getCompetitors(data, espnName);

  const players = competitors.map((c) => {
    const linescores = c.linescores || [];
    const scores = { day1: null, day2: null, day3: null, day4: null };
    const thru = { day1: null, day2: null, day3: null, day4: null };
    const relativeScores = { day1: null, day2: null, day3: null, day4: null };

    for (let i = 0; i < linescores.length; i++) {
      const ls = linescores[i];
      if (!ls || !ls.displayValue || ls.displayValue === '-') continue;

      const holes = holesPlayed(ls);
      if (holes === 0) continue;

      scores[`day${i + 1}`] = Math.round(ls.value);
      thru[`day${i + 1}`] = holes >= 18 ? 'F' : holes;
      relativeScores[`day${i + 1}`] = ls.displayValue;
    }

    return {
      espnId: c.id,
      name: c.athlete?.displayName || 'Unknown',
      scores,
      thru,
      relativeScores,
    };
  });

  return { players };
}


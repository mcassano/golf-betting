const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

/**
 * Fetch raw scoreboard data from ESPN.
 * Optionally pass a date string (YYYYMMDD) to get a specific day.
 */
async function fetchScoreboard(date) {
  const url = date ? `${ESPN_SCOREBOARD_URL}?dates=${date}` : ESPN_SCOREBOARD_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN API returned ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Extract competitors array from ESPN response.
 */
function getCompetitors(data) {
  const event = data?.events?.[0];
  if (!event) return [];
  const competition = event.competitions?.[0];
  if (!competition) return [];
  return competition.competitors || [];
}

/**
 * Derive course par from any completed round linescore.
 * par = linescore.value - parseInt(linescore.displayValue)
 */
function deriveCoursePar(competitors) {
  for (const c of competitors) {
    for (const ls of c.linescores || []) {
      if (!ls.value || !ls.displayValue || ls.displayValue === '-') continue;
      if (!isCompleteRound(ls)) continue;
      const strokes = ls.value;
      // "E" means even par, so strokes = par
      if (ls.displayValue === 'E') return strokes;
      const relToPar = parseInt(ls.displayValue, 10);
      if (isNaN(relToPar)) continue;
      const par = strokes - relToPar;
      if (par > 60 && par < 80) return par;
    }
  }
  return null;
}

/**
 * Count holes played in a linescore by summing stats[0] through stats[5].
 * Note: ESPN sometimes undercounts by 1-2 (e.g. 17 instead of 18).
 */
function holesPlayed(linescore) {
  const stats = linescore?.statistics?.categories?.[0]?.stats;
  if (!stats || stats.length < 6) return 0;
  let total = 0;
  for (let i = 0; i <= 5; i++) {
    total += parseFloat(stats[i]?.value || 0);
  }
  return total;
}

/**
 * Check if a linescore represents a completed round.
 * Uses displayValue (must be a real score, not "-") AND holes played >= 16
 * (ESPN stat categories sometimes undercount by 1-2, so we allow some slack).
 */
function isCompleteRound(linescore) {
  if (!linescore || !linescore.displayValue || linescore.displayValue === '-') return false;
  return holesPlayed(linescore) >= 16;
}

/**
 * fetchTournament() - Setup/init mode.
 * Returns { eventName, eventId, coursePar, players: [{ name, espnId }] }
 */
export async function fetchTournament(date) {
  const data = await fetchScoreboard(date);
  const event = data?.events?.[0];
  if (!event) {
    throw new Error('No event found in ESPN scoreboard data');
  }

  const competitors = getCompetitors(data);
  const coursePar = deriveCoursePar(competitors);

  const players = competitors.map((c) => ({
    name: c.athlete?.displayName || 'Unknown',
    espnId: c.id,
  }));

  return {
    eventName: event.name || event.shortName || 'Unknown Event',
    eventId: event.id,
    coursePar,
    players,
  };
}

/**
 * fetchScores() - Score refresh mode.
 * Returns { players: [{ espnId, name, scores: { day1, day2, day3, day4 } }] }
 */
export async function fetchScores(date) {
  const data = await fetchScoreboard(date);
  const competitors = getCompetitors(data);

  const players = competitors.map((c) => {
    const linescores = c.linescores || [];
    const scores = { day1: null, day2: null, day3: null, day4: null };

    for (let i = 0; i < linescores.length; i++) {
      const ls = linescores[i];
      if (isCompleteRound(ls)) {
        scores[`day${i + 1}`] = Math.round(ls.value);
      }
    }

    return {
      espnId: c.id,
      name: c.athlete?.displayName || 'Unknown',
      scores,
    };
  });

  return { players };
}


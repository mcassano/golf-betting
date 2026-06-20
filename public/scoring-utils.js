// Shared scoring utilities — used by the client (app.js) and tested by vitest.
// Loaded as an ES module in both browser (<script type="module">) and Node/vitest.

export function isRoundInProgress(thru) {
  return !!thru && thru !== 'F' && thru !== '18';
}

// Parse a rel string ("-4", "E", "+2") into a numeric diff. Returns null if unparseable.
export function parseRel(rel) {
  if (!rel) return null;
  if (rel === 'E') return 0;
  const n = parseInt(rel, 10);
  return isNaN(n) ? null : n;
}

// Format a numeric diff as relative-to-par string with color.
export function diffToParStr(diff) {
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `<span class="text-red-600">${diff}</span>`;
}

// Format raw total relative to par across `played` rounds.
export function toParStr(total, played, par) {
  return diffToParStr(total - played * par);
}

// Did this golfer miss the cut? True if any day is flagged 'CUT', OR if their
// R1+R2 to-par is worse than `cutLine` (scores at or below the line made it).
// `cutLine` is the to-par cut line for the event (e.g. +4); it defaults to 4,
// which reproduces the legacy "+5 and worse missed" rule. Accepts a `scores`
// object shaped like { day1, day2, day1Rel, day2Rel, day1Thru, day2Thru, ... }.
// Uses ESPN rel values when available and only falls back to gross-par for a
// finished round (so an in-progress R1 or R2 never triggers).
export function didMissCut(scores, par, cutLine = 4) {
  if (!scores) return false;
  const days = [scores.day1, scores.day2, scores.day3, scores.day4];
  if (days.some((v) => v === 'CUT')) return true;

  const dayDiff = (raw, rel, thru) => {
    if (raw === undefined || raw === null || raw === '' || raw === 'CUT' || raw === 'WD') return null;
    const r = parseRel(rel);
    if (r !== null) return r;
    if (isRoundInProgress(thru)) return null;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n - par;
  };

  const d1 = dayDiff(scores.day1, scores.day1Rel, scores.day1Thru);
  const d2 = dayDiff(scores.day2, scores.day2Rel, scores.day2Thru);
  if (d1 === null || d2 === null) return false;
  return d1 + d2 > cutLine;
}

// Sum all rounds (including in-progress) using ESPN rel values where available,
// falling back to gross strokes minus par for completed rounds.
export function sumAllRelative(dayScores, dayThrus, dayRels, par) {
  let diff = 0, count = 0;
  for (let i = 0; i < dayScores.length; i++) {
    const v = dayScores[i];
    if (v === undefined || v === null || v === '' || v === 'CUT' || v === 'WD') continue;
    const n = parseInt(v, 10);
    if (isNaN(n)) continue;
    const rd = parseRel(dayRels[i]);
    if (rd !== null) {
      diff += rd;
      count++;
    } else if (!isRoundInProgress(dayThrus ? dayThrus[i] : null)) {
      diff += n - par;
      count++;
    }
  }
  return { diff, count };
}

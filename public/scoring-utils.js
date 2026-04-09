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

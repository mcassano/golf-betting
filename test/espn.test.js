import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to build a linescore with the stats structure ESPN uses
function makeLinescore(value, displayValue, holesPlayed) {
  // ESPN stats: [birdies, bogeys, ?, double bogeys, ?, pars] — sum = holes played
  const pars = holesPlayed;
  return {
    value,
    displayValue,
    statistics: {
      categories: [{
        stats: [
          { value: 0 },  // birdies
          { value: 0 },  // bogeys
          { value: 0 },
          { value: 0 },
          { value: 0 },
          { value: pars }, // pars (all holes as pars for simplicity)
        ],
      }],
    },
  };
}

function makeEspnResponse(competitors) {
  return {
    events: [{
      id: '12345',
      name: 'Test Tournament',
      competitions: [{ competitors }],
    }],
  };
}

function makeCompetitor(id, name, linescores) {
  return {
    id,
    athlete: { displayName: name },
    linescores,
  };
}

// Mock global fetch
let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Import after mocks are set up
const { fetchScores, fetchTournament } = await import('../services/espn.js');

// ── fetchScores ─────────────────────────────────────────────────────────────

describe('fetchScores', () => {
  it('returns completed round with thru F', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(68, '-4', 18),
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players).toHaveLength(1);
    expect(players[0].scores.day1).toBe(68);
    expect(players[0].thru.day1).toBe('F');
    expect(players[0].scores.day2).toBeNull();
    expect(players[0].thru.day2).toBeNull();
  });

  it('returns in-progress round with thru as hole count', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(34.0, '-2', 9),
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores.day1).toBe(34);
    expect(players[0].thru.day1).toBe(9);
  });

  it('skips linescores with displayValue of "-"', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(68, '-4', 18),
        { value: 0, displayValue: '-' },  // not started
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores.day1).toBe(68);
    expect(players[0].thru.day1).toBe('F');
    expect(players[0].scores.day2).toBeNull();
    expect(players[0].thru.day2).toBeNull();
  });

  it('handles multiple rounds with mixed completion', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(68, '-4', 18),   // day 1 complete
        makeLinescore(35, '-1', 10),   // day 2 in progress
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores.day1).toBe(68);
    expect(players[0].thru.day1).toBe('F');
    expect(players[0].scores.day2).toBe(35);
    expect(players[0].thru.day2).toBe(10);
  });

  it('handles multiple competitors', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(68, '-4', 18),
      ]),
      makeCompetitor('200', 'Rory McIlroy', [
        makeLinescore(34, '-2', 9),
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players).toHaveLength(2);
    expect(players[0].espnId).toBe('100');
    expect(players[0].thru.day1).toBe('F');
    expect(players[1].espnId).toBe('200');
    expect(players[1].thru.day1).toBe(9);
  });

  it('returns all nulls when competitor has no linescores', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', []),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores).toEqual({ day1: null, day2: null, day3: null, day4: null });
    expect(players[0].thru).toEqual({ day1: null, day2: null, day3: null, day4: null });
  });

  it('skips linescores with 0 holes played', async () => {
    const ls = makeLinescore(0, 'E', 0);
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [ls]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores.day1).toBeNull();
    expect(players[0].thru.day1).toBeNull();
  });

  it('rounds fractional linescore values', async () => {
    const response = makeEspnResponse([
      makeCompetitor('100', 'Tiger Woods', [
        makeLinescore(67.8, '-4', 18),
      ]),
    ]);
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) });

    const { players } = await fetchScores();
    expect(players[0].scores.day1).toBe(68);
  });
});

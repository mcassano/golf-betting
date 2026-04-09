import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store to mock Redis
const store = {};
vi.mock('../services/redis.js', () => ({
  get: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  mget: vi.fn((...keys) => Promise.resolve(keys.map((k) => store[k] ?? null))),
  getJSON: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  set: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
  setJSON: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
}));

// Mock espn.js to return controlled data
const mockFetchScores = vi.fn();
vi.mock('../services/espn.js', () => ({
  fetchScores: (...args) => mockFetchScores(...args),
  fetchTournament: vi.fn(),
}));

import { syncScores } from '../services/espn-sync.js';

function clearStore() {
  for (const key of Object.keys(store)) delete store[key];
  mockFetchScores.mockReset();
}

beforeEach(() => clearStore());

// ── syncScores ──────────────────────────────────────────────────────────────

describe('syncScores', () => {
  it('writes scores and thru for completed rounds', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 68, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    const result = await syncScores(io);

    expect(result.updated).toBe(1);
    expect(store['scores:Tiger_Woods:day1']).toBe('68');
    expect(store['scores:Tiger_Woods:day1:thru']).toBe('F');
  });

  it('writes scores and thru for in-progress rounds', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 34, day2: null, day3: null, day4: null },
        thru: { day1: '9', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    const result = await syncScores(io);

    expect(result.updated).toBe(1);
    expect(store['scores:Tiger_Woods:day1']).toBe('34');
    expect(store['scores:Tiger_Woods:day1:thru']).toBe('9');
  });

  it('updates thru as round progresses', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];
    // Already has 9-hole score
    store['scores:Tiger_Woods:day1'] = '34';
    store['scores:Tiger_Woods:day1:thru'] = '9';

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 52, day2: null, day3: null, day4: null },
        thru: { day1: '14', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    const result = await syncScores(io);

    expect(result.updated).toBe(1);
    expect(store['scores:Tiger_Woods:day1']).toBe('52');
    expect(store['scores:Tiger_Woods:day1:thru']).toBe('14');
  });

  it('skips players without matching espnId', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '999',  // no match
        name: 'Unknown Player',
        scores: { day1: 72, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const result = await syncScores(null);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('does not overwrite admin-locked scores', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = ['Tiger_Woods:day1'];
    store['scores:Tiger_Woods:day1'] = '70';

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 68, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const result = await syncScores(null);
    expect(result.updated).toBe(0);
    expect(store['scores:Tiger_Woods:day1']).toBe('70');  // unchanged
  });

  it('does not count as updated when score is unchanged', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];
    store['scores:Tiger_Woods:day1'] = '68';

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 68, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    const result = await syncScores(io);
    expect(result.updated).toBe(0);
    // But thru should still be updated
    expect(store['scores:Tiger_Woods:day1:thru']).toBe('F');
  });

  it('emits scores:updated via socket when scores change', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 68, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    await syncScores(io);
    expect(io.emit).toHaveBeenCalledWith('scores:updated', { source: 'espn', updated: 1 });
  });

  it('does not emit when no scores change', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];
    store['scores:Tiger_Woods:day1'] = '68';

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: 68, day2: null, day3: null, day4: null },
        thru: { day1: 'F', day2: null, day3: null, day4: null },
      }],
    });

    const io = { emit: vi.fn() };
    await syncScores(io);
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('updates lastEspnSync in tournament meta', async () => {
    store['tournament:players'] = [{ name: 'Tiger Woods', espnId: '100' }];
    store['scores:locked'] = [];
    store['tournament:meta'] = { name: 'Test', status: 'day1' };

    mockFetchScores.mockResolvedValue({
      players: [{
        espnId: '100',
        name: 'Tiger Woods',
        scores: { day1: null, day2: null, day3: null, day4: null },
        thru: { day1: null, day2: null, day3: null, day4: null },
      }],
    });

    await syncScores(null);
    expect(store['tournament:meta'].lastEspnSync).toBeDefined();
  });

  it('returns early when no stored players', async () => {
    mockFetchScores.mockResolvedValue({ players: [] });
    const result = await syncScores(null);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

import { Router } from 'express';
import { get, set, getJSON, setJSON, keys, del, withLock } from '../services/redis.js';
import { shuffle, buildPickOrder, getCurrentPlayer, buildTeams } from '../services/draft.js';
import { computeLeaderboard } from '../services/betting.js';
import { encodeKey } from '../services/scoring.js';
import { syncScores, syncPlayers } from '../services/espn-sync.js';
import { startPolling, stopPolling, getPollingStatus } from '../services/espn-poller.js';

const router = Router();

// Lazy-imported io (set by server.js after Socket.io init)
let _io;
export function setIo(io) { _io = io; }
const emit = (event, data) => _io && _io.emit(event, data);

// ── Middleware ────────────────────────────────────────────────────────────────

function getUser(req) {
  return req.signedCookies?.user || null;
}

function requireUser(req, res, next) {
  if (!getUser(req)) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function requireStatus(...allowed) {
  return async (req, res, next) => {
    const meta = await getJSON('tournament:meta');
    if (!meta || !allowed.includes(meta.status)) {
      return res.status(409).json({ error: `Action not allowed in status: ${meta?.status}` });
    }
    req.tournamentMeta = meta;
    next();
  };
}

// ── Health ────────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => res.json({ ok: true }));

// ── Session ───────────────────────────────────────────────────────────────────

router.get('/session', (req, res) => {
  const name = getUser(req);
  res.json({ name });
});

router.post('/session', async (req, res) => {
  const { name } = req.body;
  const users = await getJSON('users');
  if (!users || !users.includes(name)) {
    return res.status(400).json({ error: 'Unknown user' });
  }
  res.cookie('user', name, {
    signed: true,
    httpOnly: true,
    maxAge: 7 * 24 * 3600 * 1000,
    sameSite: 'lax',
  });
  res.json({ name });
});

router.post('/session/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ ok: true });
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const users = await getJSON('users');
  res.json(users || []);
});

// ── Tournament ────────────────────────────────────────────────────────────────

router.get('/tournament', async (req, res) => {
  const meta = await getJSON('tournament:meta');
  res.json(meta);
});

router.post('/admin/tournament', requireUser, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  await setJSON('tournament:meta', { name, status: 'setup' });
  res.json({ ok: true });
});

router.post('/admin/tournament/reset', requireUser, async (req, res) => {
  const allKeys = await keys('*');
  // Don't delete users
  const toDelete = allKeys.filter((k) => k !== 'users');
  if (toDelete.length) await del(...toDelete);
  res.json({ ok: true });
});

router.post('/admin/tournament/advance', requireUser, async (req, res) => {
  const { status } = req.body;
  const valid = ['day1', 'day2', 'day3', 'day4', 'complete'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const meta = await getJSON('tournament:meta');
  if (!meta) return res.status(400).json({ error: 'No tournament' });
  meta.status = status;
  await setJSON('tournament:meta', meta);
  emit('tournament:advanced', { status });
  res.json({ ok: true });
});

// ── Players ───────────────────────────────────────────────────────────────────

router.get('/players', async (req, res) => {
  const players = await getJSON('tournament:players');
  res.json(players || []);
});

router.post('/admin/players', requireUser, requireStatus('setup'), async (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'players array required' });
  }
  const normalized = players.map((p) =>
    typeof p === 'string' ? { name: p, wcEligible: false } : p
  );
  await setJSON('tournament:players', normalized);
  res.json({ ok: true });
});

router.patch('/admin/players/:name/wc', requireUser, requireStatus('setup'), async (req, res) => {
  const { wcEligible } = req.body;
  const name = decodeURIComponent(req.params.name);
  const players = await getJSON('tournament:players');
  if (!players) return res.status(400).json({ error: 'No players' });
  const idx = players.findIndex((p) => p.name === name);
  if (idx === -1) return res.status(404).json({ error: 'Player not found' });
  players[idx].wcEligible = !!wcEligible;
  await setJSON('tournament:players', players);
  res.json({ ok: true });
});

// ── Draft ─────────────────────────────────────────────────────────────────────

router.get('/draft/state', async (req, res) => {
  const draftOrder = await getJSON('draft:order');
  const picks = await getJSON('draft:picks') || [];
  const currentPick = parseInt(await get('draft:currentPick') || '0', 10);
  const allGolfers = await getJSON('tournament:players') || [];
  const pickedGolfers = picks.map((p) => p.golfer);
  const availableGolfers = allGolfers.filter((g) => !pickedGolfers.includes(g.name));
  const pickOrder = draftOrder ? buildPickOrder(draftOrder) : [];
  const currentPlayer = pickOrder[currentPick] || null;
  res.json({ order: draftOrder, picks, currentPick, currentPlayer, availableGolfers });
});

router.post('/admin/draft/start', requireUser, requireStatus('setup'), async (req, res) => {
  const users = await getJSON('users');
  const players = await getJSON('tournament:players');
  const minPlayers = users.length * 6;
  if (!players || players.length < minPlayers) {
    return res.status(400).json({ error: `Need at least ${minPlayers} golfers in the player list` });
  }
  const draftOrder = shuffle(users);
  const pickOrder = buildPickOrder(draftOrder);
  await setJSON('draft:order', draftOrder);
  await setJSON('draft:picks', []);
  await set('draft:currentPick', '0');
  const meta = await getJSON('tournament:meta');
  meta.status = 'drafting';
  await setJSON('tournament:meta', meta);

  const availableGolfers = players;
  const currentPlayer = pickOrder[0];
  emit('draft:started', { order: draftOrder, currentPick: 0, currentPlayer, availableGolfers });
  res.json({ ok: true });
});

router.post('/draft/pick', requireUser, requireStatus('drafting'), async (req, res) => {
  const player = getUser(req);
  const { golfer } = req.body;
  if (!golfer) return res.status(400).json({ error: 'golfer required' });

  try {
    await withLock('lock:draft:pick', 5000, async () => {
      const draftOrder = await getJSON('draft:order');
      const picks = await getJSON('draft:picks') || [];
      const currentPickIndex = parseInt(await get('draft:currentPick') || '0', 10);
      const pickOrder = buildPickOrder(draftOrder);
      const currentPlayer = pickOrder[currentPickIndex];

      if (player !== currentPlayer) {
        throw Object.assign(new Error('Not your turn'), { status: 403 });
      }

      const allGolfers = await getJSON('tournament:players') || [];
      if (!allGolfers.find((g) => g.name === golfer)) {
        throw Object.assign(new Error('Unknown golfer'), { status: 400 });
      }
      if (picks.find((p) => p.golfer === golfer)) {
        throw Object.assign(new Error('Already picked'), { status: 400 });
      }

      picks.push({ player, golfer, pickNumber: currentPickIndex });
      const nextPickIndex = currentPickIndex + 1;
      await setJSON('draft:picks', picks);
      await set('draft:currentPick', String(nextPickIndex));

      const users = await getJSON('users');

      if (nextPickIndex >= pickOrder.length) {
        const teams = buildTeams(picks, users);
        for (const [p, golfers] of Object.entries(teams)) {
          await setJSON(`teams:${p}`, golfers);
        }
        const meta = req.tournamentMeta;
        meta.status = 'wc_selection';
        await setJSON('tournament:meta', meta);
        emit('draft:complete', { teams });
      } else {
        const nextPlayer = pickOrder[nextPickIndex];
        const pickedGolfers = picks.map((p) => p.golfer);
        const availableGolfers = allGolfers.filter((g) => !pickedGolfers.includes(g.name));
        emit('draft:pick', { picks, currentPick: nextPickIndex, currentPlayer: nextPlayer, availableGolfers });
      }
    });
    res.json({ ok: true });
  } catch (e) {
    const status = e.status || 409;
    res.status(status).json({ error: e.message });
  }
});

// ── Teams ─────────────────────────────────────────────────────────────────────

router.get('/teams', async (req, res) => {
  const users = await getJSON('users') || [];
  const teams = {};
  for (const u of users) {
    teams[u] = await getJSON(`teams:${u}`) || [];
  }
  res.json(teams);
});

router.get('/teams/:player', async (req, res) => {
  const golfers = await getJSON(`teams:${req.params.player}`) || [];
  res.json(golfers);
});

// Admin: replace a team wholesale. Body: { golfers: [name, ...] }
router.put('/admin/teams/:player', requireUser, async (req, res) => {
  const { golfers } = req.body;
  if (!Array.isArray(golfers)) return res.status(400).json({ error: 'golfers array required' });
  const allGolfers = await getJSON('tournament:players') || [];
  const validNames = new Set(allGolfers.map((g) => g.name));
  const invalid = golfers.filter((g) => !validNames.has(g));
  if (invalid.length) return res.status(400).json({ error: `Unknown golfers: ${invalid.join(', ')}` });
  await setJSON(`teams:${req.params.player}`, golfers);
  emit('teams:updated', { player: req.params.player });
  res.json({ ok: true, golfers });
});

// ── WC ────────────────────────────────────────────────────────────────────────

router.get('/wc', async (req, res) => {
  const users = await getJSON('users') || [];
  const wc = {};
  for (const u of users) {
    wc[u] = await get(`wc:${u}`);
  }
  res.json(wc);
});

router.get('/wc/eligible', requireUser, async (req, res) => {
  const player = getUser(req);
  const allGolfers = await getJSON('tournament:players') || [];
  const myTeam = await getJSON(`teams:${player}`) || [];
  const eligible = allGolfers.filter((g) => g.wcEligible && !myTeam.includes(g.name));
  res.json(eligible);
});

router.post('/wc/pick', requireUser, requireStatus('wc_selection'), async (req, res) => {
  const player = getUser(req);
  const { golfer } = req.body;
  if (!golfer) return res.status(400).json({ error: 'golfer required' });

  const allGolfers = await getJSON('tournament:players') || [];
  const golferObj = allGolfers.find((g) => g.name === golfer);
  if (!golferObj || !golferObj.wcEligible) {
    return res.status(400).json({ error: 'Golfer not WC eligible' });
  }
  const myTeam = await getJSON(`teams:${player}`) || [];
  if (myTeam.includes(golfer)) {
    return res.status(400).json({ error: 'Cannot pick your own draft pick as WC' });
  }

  await set(`wc:${player}`, golfer);
  emit('wc:picked', { player, golfer });

  // Check if all users have WC picks — advance to day1
  const users = await getJSON('users') || [];
  const allPicked = await Promise.all(users.map((u) => get(`wc:${u}`)));
  if (allPicked.every((w) => w !== null)) {
    const meta = req.tournamentMeta;
    meta.status = 'day1';
    await setJSON('tournament:meta', meta);
    emit('tournament:advanced', { status: 'day1' });
  }

  res.json({ ok: true });
});

// ── Scores ────────────────────────────────────────────────────────────────────

router.get('/scores', async (req, res) => {
  const allGolfers = await getJSON('tournament:players') || [];
  const result = {};
  for (const g of allGolfers) {
    const key = encodeKey(g.name);
    result[g.name] = {};
    for (let day = 1; day <= 4; day++) {
      result[g.name][`day${day}`] = await get(`scores:${key}:day${day}`);
    }
  }
  res.json(result);
});

router.post('/admin/scores', requireUser, async (req, res) => {
  const { golfer, day, score } = req.body;
  if (!golfer || !day) return res.status(400).json({ error: 'golfer and day required' });
  const dayN = parseInt(day, 10);
  if (dayN < 1 || dayN > 4) return res.status(400).json({ error: 'day must be 1-4' });

  const key = encodeKey(golfer);
  const val = score === 'CUT' || score === 'WD' ? score : String(parseInt(score, 10));
  await set(`scores:${key}:day${dayN}`, val);
  // Lock this score so ESPN sync won't overwrite it
  const locked = await getJSON('scores:locked') || [];
  const lockId = `${key}:day${dayN}`;
  if (!locked.includes(lockId)) {
    locked.push(lockId);
    await setJSON('scores:locked', locked);
  }
  emit('scores:updated', { golfer, day: dayN, score: val });
  res.json({ ok: true });
});

router.post('/admin/scores/wd', requireUser, async (req, res) => {
  const { golfer, fromDay } = req.body;
  if (!golfer) return res.status(400).json({ error: 'golfer required' });

  // Default fromDay to current tournament day
  let dayStart = parseInt(fromDay, 10);
  if (!dayStart || dayStart < 1 || dayStart > 4) {
    const meta = await getJSON('tournament:meta');
    const statusDay = { day1: 1, day2: 2, day3: 3, day4: 4, complete: 4 };
    dayStart = statusDay[meta?.status] || 1;
  }

  const key = encodeKey(golfer);
  for (let d = dayStart; d <= 4; d++) {
    await set(`scores:${key}:day${d}`, 'WD');
  }
  emit('scores:updated', { golfer, wd: true, fromDay: dayStart });
  res.json({ ok: true, fromDay: dayStart, throughDay: 4 });
});

// Admin: unlock a score so ESPN sync can write to it again
router.delete('/admin/scores/lock', requireUser, async (req, res) => {
  const { golfer, day } = req.body;
  if (!golfer || !day) return res.status(400).json({ error: 'golfer and day required' });
  const key = encodeKey(golfer);
  const lockId = `${key}:day${parseInt(day, 10)}`;
  const locked = await getJSON('scores:locked') || [];
  await setJSON('scores:locked', locked.filter((l) => l !== lockId));
  res.json({ ok: true });
});

// Bulk score entry (paste a whole day's scores at once)
router.post('/admin/scores/bulk', requireUser, async (req, res) => {
  // body: { day: 1, scores: [{golfer, score}, ...] }
  const { day, scores } = req.body;
  if (!day || !Array.isArray(scores)) return res.status(400).json({ error: 'day and scores[] required' });
  const dayN = parseInt(day, 10);
  const locked = await getJSON('scores:locked') || [];
  for (const { golfer, score } of scores) {
    const key = encodeKey(golfer);
    const val = score === 'CUT' || score === 'WD' ? score : String(parseInt(score, 10));
    await set(`scores:${key}:day${dayN}`, val);
    const lockId = `${key}:day${dayN}`;
    if (!locked.includes(lockId)) locked.push(lockId);
  }
  await setJSON('scores:locked', locked);
  emit('scores:updated', { bulk: true, day: dayN });
  res.json({ ok: true });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

router.get('/leaderboard', async (req, res) => {
  const users = await getJSON('users') || [];
  const meta = await getJSON('tournament:meta');
  const leaderboard = await computeLeaderboard(users, meta);
  res.json(leaderboard);
});

// ── ESPN Integration ─────────────────────────────────────────────────────────

router.post('/admin/espn/sync-players', requireUser, async (req, res) => {
  try {
    const result = await syncPlayers(req.body?.date);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[ESPN] Player sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/espn/sync-scores', requireUser, async (req, res) => {
  try {
    const result = await syncScores(_io, req.body?.date);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[ESPN] Score sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/espn/start-polling', requireUser, async (req, res) => {
  const started = startPolling(_io);
  if (started) {
    res.json({ ok: true, message: 'Polling started' });
  } else {
    res.json({ ok: false, message: 'Already polling' });
  }
});

router.post('/admin/espn/stop-polling', requireUser, async (req, res) => {
  const stopped = stopPolling();
  if (stopped) {
    res.json({ ok: true, message: 'Polling stopped' });
  } else {
    res.json({ ok: false, message: 'Not currently polling' });
  }
});

router.get('/admin/espn/status', requireUser, async (req, res) => {
  const status = getPollingStatus();
  const meta = await getJSON('tournament:meta');
  res.json({
    ...status,
    lastEspnSync: meta?.lastEspnSync || null,
    espnEventId: meta?.espnEventId || null,
  });
});

export default router;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory store to mock Redis
const store = {};
vi.mock('../services/redis.js', () => ({
  get: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  getJSON: vi.fn((key) => Promise.resolve(store[key] ?? null)),
  set: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
  setJSON: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve(Object.keys(store))),
  del: vi.fn((...k) => { k.forEach((key) => delete store[key]); return Promise.resolve(); }),
  withLock: vi.fn((key, ttl, fn) => fn()),
}));

// Must import router after mocks are set up
const { default: router } = await import('../routes/api.js');

function clearStore() {
  for (const key of Object.keys(store)) delete store[key];
}

// Minimal Express-like request/response mocks
function mockReq(method, path, body = {}, cookies = {}) {
  return { method, path, body, signedCookies: cookies };
}

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    _cookie: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res._json = data; return res; },
    cookie(name, value, opts) { res._cookie = { name, value, opts }; return res; },
    clearCookie() { return res; },
  };
  return res;
}

// Find the route handler from the router stack
function findHandler(method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route found: ${method.toUpperCase()} ${path}`);
  // Return the last handler (skip middleware like requireUser)
  const handlers = layer.route.stack.map((s) => s.handle);
  return handlers;
}

async function callRoute(method, path, body = {}, cookies = {}) {
  const handlers = findHandler(method, path);
  const req = mockReq(method, path, body, cookies);
  const res = mockRes();
  for (const handler of handlers) {
    let called = false;
    const next = () => { called = true; };
    await handler(req, res, next);
    if (!called) break;
  }
  return res;
}

beforeEach(() => {
  clearStore();
  store.users = ['Mike', 'Caleb', 'Marshall'];
  process.env.GOLF_PIN = '1289';
});

const savedEnv = process.env.GOLF_PIN;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.GOLF_PIN;
  else process.env.GOLF_PIN = savedEnv;
});

// ── POST /session — PIN validation ──────────────────────────────────────────

describe('POST /session', () => {
  it('rejects unknown user', async () => {
    const res = await callRoute('post', '/session', { name: 'Nobody', pin: '1289' });
    expect(res.statusCode).toBe(400);
    expect(res._json.error).toMatch(/unknown/i);
  });

  it('rejects missing PIN', async () => {
    const res = await callRoute('post', '/session', { name: 'Mike' });
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toMatch(/pin/i);
  });

  it('rejects wrong PIN', async () => {
    const res = await callRoute('post', '/session', { name: 'Mike', pin: '0000' });
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toMatch(/pin/i);
  });

  it('accepts correct PIN', async () => {
    const res = await callRoute('post', '/session', { name: 'Mike', pin: '1289' });
    expect(res.statusCode).toBe(200);
    expect(res._json.name).toBe('Mike');
    expect(res._cookie.name).toBe('user');
    expect(res._cookie.value).toBe('Mike');
  });

  it('respects GOLF_PIN env override', async () => {
    process.env.GOLF_PIN = '9999';
    const bad = await callRoute('post', '/session', { name: 'Mike', pin: '1289' });
    expect(bad.statusCode).toBe(401);

    const good = await callRoute('post', '/session', { name: 'Mike', pin: '9999' });
    expect(good.statusCode).toBe(200);
    expect(good._json.name).toBe('Mike');
  });
});

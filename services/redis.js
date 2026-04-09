import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: false,
  connectTimeout: 15000,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redis.on('error', (err) => console.error('Redis error:', err));

export const get = (key) => redis.get(key);
export const mget = (...keys) => redis.mget(...keys);
export const set = (key, value) => redis.set(key, String(value));
export const del = (...keys) => redis.del(...keys);
export const keys = (pattern) => redis.keys(pattern);

// Simple Redis lock using SET NX EX
export async function withLock(lockKey, ttlMs, fn) {
  const acquired = await redis.set(lockKey, '1', 'PX', ttlMs, 'NX');
  if (!acquired) throw new Error('Action in progress, try again');
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

export const getJSON = async (key) => {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
};

export const setJSON = (key, value) => redis.set(key, JSON.stringify(value));

export default redis;

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err) => console.error('Redis error:', err));

export const get = (key) => redis.get(key);
export const set = (key, value) => redis.set(key, String(value));
export const del = (...keys) => redis.del(...keys);
export const keys = (pattern) => redis.keys(pattern);

export const getJSON = async (key) => {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
};

export const setJSON = (key, value) => redis.set(key, JSON.stringify(value));

export default redis;

import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { env } from "../env";
import { log } from "../lib/logger";

export type HitResult = { allowed: boolean; remaining: number; retryAfterMs: number };

export interface RateLimitStore {
  /** Records one hit for key in a sliding window and reports whether it is within the limit. */
  hit(key: string, limit: number, windowMs: number): Promise<HitResult>;
  reset(key: string): Promise<void>;
}

/**
 * Sliding-window log in a sorted set. Runs atomically in Redis and uses the
 * Redis clock, so every app instance shares the same counters and time.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry = window - (now - tonumber(oldest[2]))
if retry < 1 then retry = 1 end
return {0, 0, retry}
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {
    redis.defineCommand("cadenciaHit", { numberOfKeys: 1, lua: SLIDING_WINDOW_LUA });
  }

  async hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
    const cmd = (this.redis as unknown as {
      cadenciaHit: (k: string, l: number, w: number, m: string) => Promise<[number, number, number]>;
    }).cadenciaHit;
    const [allowed, remaining, retryAfterMs] = await cmd.call(this.redis, `rl:${key}`, limit, windowMs, randomUUID());
    return { allowed: allowed === 1, remaining, retryAfterMs };
  }

  async reset(key: string) {
    await this.redis.del(`rl:${key}`);
  }
}

/** Single-process store. Only for tests and local development without Redis. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (recent.length < limit) {
      recent.push(now);
      this.hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
    }
    this.hits.set(key, recent);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, recent[0]! + windowMs - now) };
  }

  async reset(key: string) {
    this.hits.delete(key);
  }
}

const g = globalThis as unknown as { __cadenciaRlStore?: RateLimitStore; __cadenciaRedis?: Redis };

export function getRedis(): Redis | undefined {
  const url = env().REDIS_URL;
  if (!url) return undefined;
  if (!g.__cadenciaRedis) {
    g.__cadenciaRedis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      lazyConnect: false,
    });
    g.__cadenciaRedis.on("error", (err) => log.warn("redis error", { errMessage: err.message }));
  }
  return g.__cadenciaRedis;
}

export function rateLimitStore(): RateLimitStore {
  if (!g.__cadenciaRlStore) {
    const redis = getRedis();
    if (redis) {
      g.__cadenciaRlStore = new RedisRateLimitStore(redis);
    } else {
      // env() already refuses to start production without REDIS_URL.
      log.warn("REDIS_URL not set: using in-memory rate limiting (not shared between instances)");
      g.__cadenciaRlStore = new MemoryRateLimitStore();
    }
  }
  return g.__cadenciaRlStore;
}

/** Test hook. */
export function setRateLimitStore(store: RateLimitStore | undefined) {
  g.__cadenciaRlStore = store;
}

import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { RedisRateLimitStore } from "@/server/security/rate-limit-store";

// Runs only when a Redis is available (docker compose or CI service).
const url = process.env.TEST_REDIS_URL;

describe.skipIf(!url)("Redis sliding-window rate limiter", () => {
  const redis = new Redis(url ?? "", { maxRetriesPerRequest: 1 });
  const store = new RedisRateLimitStore(redis);
  afterAll(() => redis.quit());

  it("allows up to the limit, then blocks with a retry time", async () => {
    const key = `test:${randomUUID()}`;
    for (let i = 0; i < 3; i++) expect((await store.hit(key, 3, 10_000)).allowed).toBe(true);
    const blocked = await store.hit(key, 3, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it("is atomic under concurrent hits (no over-admission)", async () => {
    const key = `test:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 50 }, () => store.hit(key, 10, 10_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("frees slots after the window and sets an expiry on the key", async () => {
    const key = `test:${randomUUID()}`;
    expect((await store.hit(key, 1, 200)).allowed).toBe(true);
    expect((await store.hit(key, 1, 200)).allowed).toBe(false);
    expect(await redis.pttl(`rl:${key}`)).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 250));
    expect((await store.hit(key, 1, 200)).allowed).toBe(true);
  });

  it("reset clears the counter", async () => {
    const key = `test:${randomUUID()}`;
    await store.hit(key, 1, 10_000);
    await store.reset(key);
    expect((await store.hit(key, 1, 10_000)).allowed).toBe(true);
  });
});

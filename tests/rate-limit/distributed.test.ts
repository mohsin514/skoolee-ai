import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, memoryStore, redisStore, type RedisEvaluator } from "../../src/lib/rate-limit";

/** A fake Redis that runs the hit script's semantics against a Map, with a controllable clock. */
function fakeRedis(clock: { now: number }) {
  const keys = new Map<string, { count: number; expiresAt: number }>();
  const seen: string[] = [];
  const client: RedisEvaluator = {
    async eval(_script, _numKeys, key, windowMs) {
      seen.push(String(key));
      let entry = keys.get(String(key));
      if (!entry || entry.expiresAt <= clock.now) {
        entry = { count: 0, expiresAt: clock.now + Number(windowMs) };
        keys.set(String(key), entry);
      }
      entry.count++;
      return [entry.count, entry.expiresAt - clock.now];
    },
  };
  return { client, seen };
}

test("two app instances sharing Redis enforce one limit, not one each", async () => {
  const clock = { now: 0 };
  const { client } = fakeRedis(clock);
  const instanceA = createRateLimiter({ primary: redisStore(client), fallback: memoryStore(), now: () => clock.now });
  const instanceB = createRateLimiter({ primary: redisStore(client), fallback: memoryStore(), now: () => clock.now });

  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await instanceA("signup:203.0.113.7", { limit: 5, windowMs: 60_000 }));
    results.push(await instanceB("signup:203.0.113.7", { limit: 5, windowMs: 60_000 }));
  }
  assert.deepEqual(results.map((r) => r.ok), [true, true, true, true, true, false]);
  assert.equal(results[5].retryAfterSeconds, 60);
});

test("the window resets after it expires", async () => {
  const clock = { now: 0 };
  const limiter = createRateLimiter({ primary: null, fallback: memoryStore({ now: () => clock.now }), now: () => clock.now });
  assert.equal((await limiter("k", { limit: 1, windowMs: 1_000 })).ok, true);
  assert.equal((await limiter("k", { limit: 1, windowMs: 1_000 })).ok, false);
  clock.now = 1_000;
  assert.deepEqual(await limiter("k", { limit: 1, windowMs: 1_000 }), { ok: true, remaining: 0, retryAfterSeconds: 0 });
});

test("raw scopes (IPs, phones, user ids) never reach Redis", async () => {
  const { client, seen } = fakeRedis({ now: 0 });
  const limiter = createRateLimiter({ primary: redisStore(client), fallback: memoryStore() });
  await limiter("otp-send-phone:+923001234567");
  assert.equal(seen.length, 1);
  assert.match(seen[0], /^rl:[A-Za-z0-9_-]{32}$/);
  assert.ok(!seen[0].includes("923001234567"));
});

test("a hung Redis falls back to memory, trips the breaker, and is retried after it", async () => {
  const clock = { now: 0 };
  let calls = 0;
  const hung: RedisEvaluator = { eval: () => { calls++; return new Promise(() => {}); } };
  const limiter = createRateLimiter({ primary: redisStore(hung), fallback: memoryStore(), timeoutMs: 10, breakerMs: 1_000, now: () => clock.now });

  const started = Date.now();
  assert.equal((await limiter("k", { limit: 2 })).ok, true);
  assert.ok(Date.now() - started < 500, "a dead Redis must not hold the request");
  assert.equal(calls, 1);

  // Breaker open: Redis is skipped and the memory window keeps counting.
  assert.equal((await limiter("k", { limit: 2 })).ok, true);
  assert.equal((await limiter("k", { limit: 2 })).ok, false);
  assert.equal(calls, 1);

  clock.now = 1_000;
  await limiter("k", { limit: 2 });
  assert.equal(calls, 2, "Redis is tried again once the breaker closes");
});

test("a Redis error falls back without throwing", async () => {
  const broken: RedisEvaluator = { eval: async () => { throw new Error("ECONNREFUSED"); } };
  const limiter = createRateLimiter({ primary: redisStore(broken), fallback: memoryStore() });
  assert.deepEqual(await limiter("k", { limit: 1 }), { ok: true, remaining: 0, retryAfterSeconds: 0 });
});

test("the memory fallback stays bounded", async () => {
  const store = memoryStore({ maxKeys: 3 });
  for (let i = 0; i < 10; i++) await store.hit(`k${i}`, 60_000);
  // The newest key is still counted correctly after evictions.
  assert.equal((await store.hit("k9", 60_000)).count, 2);
});

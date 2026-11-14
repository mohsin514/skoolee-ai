import { test } from "node:test";
import assert from "node:assert/strict";
import { createSharedMemo, sharedMemoEnabled, type SharedMemoClient } from "../../src/lib/cache/shared-memo";
import { createRedisGuard } from "../../src/lib/redis/guard";

/** SKAI-1973: the Redis layer behind the per-instance navigation memos. */
function fakeRedis() {
  const store = new Map<string, string>();
  const client: SharedMemoClient = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => { store.set(key, value); return "OK"; },
  };
  return { store, client: async () => client };
}

test("off unless REDIS_URL is set, and REDIS_ENABLED=false wins", () => {
  assert.equal(sharedMemoEnabled({}), false);
  assert.equal(sharedMemoEnabled({ REDIS_URL: "redis://example.invalid:6379" }), true);
  assert.equal(sharedMemoEnabled({ REDIS_URL: "redis://example.invalid:6379", REDIS_ENABLED: "false" }), false);
});

test("a second instance reuses the value; two users with the same role and access version get separate entries", async () => {
  const redis = fakeRedis();
  const instanceA = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: true, client: redis.client });
  const instanceB = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: true, client: redis.client });
  let runs = 0;
  const key = (userId: string, schoolId: string) => JSON.stringify([userId, schoolId, "campus-1", "CAMPUS_ADMIN", 0]);
  assert.deepEqual(await instanceA.get(key("u1", "school-a"), async () => ({ queue: ++runs })), { queue: 1 });
  assert.deepEqual(await instanceB.get(key("u1", "school-a"), async () => ({ queue: ++runs })), { queue: 1 }, "shared across instances");
  assert.deepEqual(await instanceB.get(key("u2", "school-a"), async () => ({ queue: ++runs })), { queue: 2 }, "another user is another entry");
  assert.deepEqual(await instanceB.get(key("u1", "school-b"), async () => ({ queue: ++runs })), { queue: 3 }, "another school is another entry");
  assert.equal(redis.store.size, 3);
});

test("a failed compute is never stored", async () => {
  const redis = fakeRedis();
  const memo = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: true, client: redis.client });
  await assert.rejects(memo.get("k", async () => { throw new Error("db down"); }));
  assert.equal(redis.store.size, 0);
  assert.equal(await memo.get("k", async () => 7), 7);
});

test("fails open to the database when Redis is down or hangs", async () => {
  const down = async (): Promise<SharedMemoClient> => { throw new Error("ECONNREFUSED"); };
  const memo = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: true, client: down });
  assert.equal(await memo.get("k", async () => "from-db"), "from-db");
  const hang: SharedMemoClient = { get: () => new Promise(() => undefined), set: () => new Promise(() => undefined) };
  const slow = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: true, client: async () => hang, guard: createRedisGuard({ timeoutMs: 5 }) });
  assert.equal(await slow.get("k", async () => "from-db"), "from-db");
});

test("disabled, it is a plain pass-through", async () => {
  let runs = 0;
  const memo = createSharedMemo({ name: "nav-test", ttlSeconds: 30, enabled: false, client: async () => { throw new Error("must not dial"); } });
  assert.equal(await memo.get("k", async () => ++runs), 1);
  assert.equal(await memo.get("k", async () => ++runs), 2);
});

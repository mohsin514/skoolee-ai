import assert from "node:assert/strict";
import { test } from "node:test";
import { createTtlMemo } from "../../src/lib/cache/ttl-memo";

// SKAI-1970: refreshing an expired key must not evict another live entry, and a new key sweeps expired entries
// before it drops the oldest live one.
const computeCounter = () => {
  const counts = new Map<string, number>();
  return { counts, fn: (key: string) => () => { counts.set(key, (counts.get(key) ?? 0) + 1); return Promise.resolve(key); } };
};

test("refreshing an expired key keeps every other live key", async () => {
  const memo = createTtlMemo({ ttlMs: 100, maxEntries: 3 });
  const { counts, fn } = computeCounter();
  await memo.get("hot", fn("hot"), 0);
  await memo.get("b", fn("b"), 50);
  await memo.get("hot", fn("hot"), 101); // refreshed while not full
  await memo.get("c", fn("c"), 120); // now full
  await memo.get("b", fn("b"), 160); // b expired: refreshing it must not push out the live hot or c
  for (const key of ["hot", "c", "b"]) await memo.get(key, fn(key), 170);
  assert.deepEqual(Object.fromEntries(counts), { hot: 2, b: 2, c: 1 });
});

test("a refreshed key moves behind older keys, so a new key evicts the oldest live entry instead", async () => {
  const memo = createTtlMemo({ ttlMs: 100, maxEntries: 3 });
  const { counts, fn } = computeCounter();
  await memo.get("hot", fn("hot"), 0);
  await memo.get("b", fn("b"), 50);
  await memo.get("hot", fn("hot"), 101);
  await memo.get("c", fn("c"), 110);
  await memo.get("d", fn("d"), 120); // full: b (at 50) is the oldest live entry, not hot (at 101)
  for (const key of ["hot", "c", "d"]) await memo.get(key, fn(key), 130);
  await memo.get("b", fn("b"), 130);
  assert.deepEqual(Object.fromEntries(counts), { hot: 2, b: 2, c: 1, d: 1 });
});

test("a new key sweeps expired entries before evicting a live one; failures are still forgotten", async () => {
  const memo = createTtlMemo({ ttlMs: 100, maxEntries: 3 });
  const { counts, fn } = computeCounter();
  await memo.get("old1", fn("old1"), 0);
  await memo.get("old2", fn("old2"), 10);
  await memo.get("live", fn("live"), 90);
  await memo.get("new", fn("new"), 150); // old1 and old2 expired: both swept, live stays
  await memo.get("live", fn("live"), 160);
  assert.equal(counts.get("live"), 1);
  await assert.rejects(memo.get("bad", () => Promise.reject(new Error("db down")), 160));
  await memo.get("bad", fn("bad"), 161);
  assert.equal(counts.get("bad"), 1, "a failed computation is not remembered");
});

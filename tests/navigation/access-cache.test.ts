import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedAccess, clearAccessCache } from "../../src/lib/navigation/access-cache";

test("the menu is computed once per scope within the TTL and again after it", async () => {
  clearAccessCache();
  let runs = 0;
  const compute = async () => ++runs;
  assert.equal(await cachedAccess("scope-a", compute, 0), 1);
  assert.equal(await cachedAccess("scope-a", compute, 59_000), 1);
  assert.equal(await cachedAccess("scope-b", compute, 59_000), 2, "a different user/role/version is a different entry");
  assert.equal(await cachedAccess("scope-a", compute, 61_000), 3, "expired");
});

test("a failed computation is not remembered", async () => {
  clearAccessCache();
  await assert.rejects(cachedAccess("scope-x", async () => { throw new Error("db down"); }, 0));
  await new Promise((r) => setImmediate(r));
  assert.equal(await cachedAccess("scope-x", async () => "ok", 1), "ok");
});

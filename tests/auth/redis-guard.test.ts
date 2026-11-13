import { test } from "node:test";
import assert from "node:assert/strict";
import { createRedisGuard } from "../../src/lib/redis/guard";

test("one slow call (a cold connection) falls back but does not switch Redis off", async () => {
  const clock = { now: 0 };
  const guard = createRedisGuard({ timeoutMs: 10, now: () => clock.now });
  assert.equal(await guard(() => new Promise(() => {}), "fallback"), "fallback");
  assert.equal(guard.isOpen(), false);
  assert.equal(await guard(async () => "redis", "fallback"), "redis");
});

test("three failures in a row open the breaker, which skips Redis until it closes", async () => {
  const clock = { now: 0 };
  let calls = 0;
  const guard = createRedisGuard({ breakerMs: 1_000, now: () => clock.now });
  const failing = async () => { calls++; throw new Error("ECONNREFUSED"); };
  for (let i = 0; i < 3; i++) await guard(failing, null);
  assert.equal(guard.isOpen(), true);
  await guard(failing, null);
  assert.equal(calls, 3, "an open breaker does not call Redis");
  clock.now = 1_000;
  assert.equal(await guard(async () => "back", null), "back");
});

test("a success resets the failure count", async () => {
  const guard = createRedisGuard({ now: () => 0 });
  const failing = async () => { throw new Error("x"); };
  await guard(failing, null); await guard(failing, null);
  await guard(async () => 1, null);
  await guard(failing, null); await guard(failing, null);
  assert.equal(guard.isOpen(), false);
});

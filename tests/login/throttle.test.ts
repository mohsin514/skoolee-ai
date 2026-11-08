import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLoginThrottle, LOGIN_LIMITS } from "../../src/lib/auth/login-throttle";

// SKAI-82: an in-memory stand-in for the shared counter table.
function memoryLimiter() {
  const counts = new Map<string, number>();
  return async (scope: string, { limit = 10 } = {}) => {
    const count = (counts.get(scope) ?? 0) + 1;
    counts.set(scope, count);
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  };
}

test("one client is slowed to a one-minute wait after its per-minute allowance", async () => {
  const limiter = memoryLimiter();
  for (let i = 0; i < LOGIN_LIMITS.client.limit; i++) assert.equal((await checkLoginThrottle("198.51.100.1", "a@x.test", limiter)).ok, true);
  const blocked = await checkLoginThrottle("198.51.100.1", "a@x.test", limiter);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test("guesses spread across many addresses still lock the account for 15 minutes", async () => {
  const limiter = memoryLimiter();
  for (let i = 0; i < LOGIN_LIMITS.account.limit; i++) {
    assert.equal((await checkLoginThrottle(`203.0.113.${i}`, "Victim@X.test ", limiter)).ok, true);
  }
  const blocked = await checkLoginThrottle("203.0.113.250", "victim@x.test", limiter);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 900);
  // Another address on the same network is unaffected.
  assert.equal((await checkLoginThrottle("203.0.113.250", "other@x.test", limiter)).ok, true);
});

test("the lockout applies to unregistered addresses the same way, so it reveals nothing", async () => {
  // The helper never consults accounts: its outcome depends only on the submitted text.
  const a = memoryLimiter(), b = memoryLimiter();
  for (let i = 0; i <= LOGIN_LIMITS.account.limit; i++) {
    const ra = await checkLoginThrottle(`192.0.2.${i}`, "exists@x.test", a);
    const rb = await checkLoginThrottle(`192.0.2.${i}`, "nobody@x.test", b);
    assert.deepEqual(ra, rb);
  }
});

test("an empty address is not an account bucket", async () => {
  const limiter = memoryLimiter();
  for (let i = 0; i < 40; i++) await checkLoginThrottle(`192.0.2.${i}`, "", limiter);
  assert.equal((await checkLoginThrottle("192.0.2.200", "", limiter)).ok, true);
});

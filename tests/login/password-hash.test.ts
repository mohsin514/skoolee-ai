import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { hashPassword, passwordWorkerCount, verifyPassword } from "../../src/lib/auth/password-hash";

// SKAI-1972: password work moves off the request thread without changing hashes.
// Fixtures are made with bcryptjs directly, exactly as stored hashes were made.
const PASSWORD = "Synthetic-QA-01-pass";
const COST_10 = bcrypt.hashSync(PASSWORD, 10);
const COST_12 = bcrypt.hashSync(PASSWORD, 12);
// The login route's TIMING_HASH, a $2a$12$ digest made before this change.
const TIMING_HASH = "$2a$12$utCRA1dXQTT8A9JBh4zQcO9TcVl2Hmaznnf01qUhQ5.w6D/T6LQ6e";

test("existing $2a$10$ and $2a$12$ hashes still verify, and wrong passwords do not", async () => {
  assert.match(COST_10, /^\$2a\$10\$/);
  assert.match(COST_12, /^\$2a\$12\$/);
  assert.equal(await verifyPassword(PASSWORD, COST_10), true);
  assert.equal(await verifyPassword(PASSWORD, COST_12), true);
  assert.equal(await verifyPassword("wrong-password", COST_10), false);
  assert.equal(await verifyPassword("wrong-password", COST_12), false);
  assert.equal(await verifyPassword(PASSWORD, TIMING_HASH), false);
  assert.ok(passwordWorkerCount() > 0, "compares run in the worker pool");
});

test("new hashes keep the requested cost and verify with plain bcryptjs", async () => {
  const at12 = await hashPassword(PASSWORD, 12);
  const at10 = await hashPassword(PASSWORD, 10);
  assert.match(at12, /^\$2[ab]\$12\$/);
  assert.match(at10, /^\$2[ab]\$10\$/);
  assert.equal(bcrypt.compareSync(PASSWORD, at12), true);
  assert.equal(bcrypt.compareSync(PASSWORD, at10), true);
  assert.notEqual(at12, await hashPassword(PASSWORD, 12), "each hash gets a fresh salt");
});

test("a burst of compares leaves the request thread responsive", async () => {
  let worstGap = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    worstGap = Math.max(worstGap, now - last);
    last = now;
  }, 5);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => verifyPassword(i % 2 ? PASSWORD : "nope", COST_12)));
  clearInterval(timer);
  assert.deepEqual(results, [false, true, false, true, false, true, false, true]);
  // One in-thread cost-12 compare blocks for ~150-400 ms; eight in a row for seconds.
  assert.ok(worstGap < 120, `event loop stalled for ${Math.round(worstGap)} ms`);
});

test("login still verifies every candidate and spends one compare on an unknown address", () => {
  const source = readFileSync(new URL("../../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "bcryptjs"/);
  assert.match(source, /for \(const candidate of candidates\) \{\s*if \(!candidate\.password\) continue;\s*if \(await verifyPassword\(password, candidate\.password\)\) matched\.push\(candidate\);/);
  assert.match(source, /if \(!candidates\.some\(\(c\) => c\.password\)\) await verifyPassword\(password, TIMING_HASH\);/);
  assert.ok(source.includes(`const TIMING_HASH = "${TIMING_HASH}"`));
});

test("no server code calls bcryptjs on the request thread any more", () => {
  const files = ["src/app/actions/auth/reset.ts", "src/app/actions/invite.ts", "src/app/api/auth/change-password/route.ts", "src/app/api/auth/first-password/route.ts", "src/app/api/owner/schools/route.ts", "src/app/api/owner/users/route.ts", "src/app/api/owner/users/[id]/password/route.ts", "src/app/api/super/users/[id]/password/route.ts", "src/lib/auth/mfa-manage-http.ts", "src/lib/auth/register.ts", "src/lib/onboarding/setup-service.ts"];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /bcryptjs|bcrypt\.(compare|hash)/, file);
  }
});

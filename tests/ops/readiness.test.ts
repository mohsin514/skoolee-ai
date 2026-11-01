import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildId, checkWithin } from "../../src/lib/ops/readiness";

// SKAI-733: the readiness probe reports a down or slow database as not ready, and leaks nothing but a short build id.
test("readiness check passes, fails and times out", async () => {
  assert.equal(await checkWithin(async () => 1), true);
  assert.equal(await checkWithin(async () => { throw new Error("db down"); }), false);
  assert.equal(await checkWithin(() => new Promise((resolve) => setTimeout(resolve, 200)), 20), false);
});

test("build id is short and falls back to unknown", () => {
  assert.equal(buildId({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123" }), "0123456789ab");
  assert.equal(buildId({}), "unknown");
});

test("ready route answers 503 when the database is down and is never cached", () => {
  const route = readFileSync("src/app/api/public/ready/route.ts", "utf8");
  assert.match(route, /status: database \? 200 : 503/);
  assert.match(route, /no-store/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.doesNotMatch(route, /DATABASE_URL|schoolId|userId|getAuthUser/);
});

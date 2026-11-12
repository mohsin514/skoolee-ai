import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BULK_REQUEST_CONCURRENCY, latestRequest, mapWithLimit } from "../../src/lib/http/request-pool";

const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));

test("200 selected students never put more than the bulk limit in flight, and results keep selection order", async () => {
  const ids = Array.from({ length: 200 }, (_, i) => `student-${i}`);
  let inFlight = 0;
  let maxInFlight = 0;
  const results = await mapWithLimit(ids, BULK_REQUEST_CONCURRENCY, async (id, index) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick(index % 3);
    inFlight -= 1;
    return id;
  });
  assert.equal(maxInFlight, BULK_REQUEST_CONCURRENCY);
  assert.ok(BULK_REQUEST_CONCURRENCY >= 4 && BULK_REQUEST_CONCURRENCY <= 6);
  assert.deepEqual(results, ids);
});

test("the first failure rejects and stops new calls from starting", async () => {
  const started: number[] = [];
  await assert.rejects(
    mapWithLimit(Array.from({ length: 50 }, (_, i) => i), 4, async (n) => {
      started.push(n);
      await tick();
      if (n === 1) throw new Error("impact preview failed");
      return n;
    }),
    /impact preview failed/,
  );
  await tick(10);
  assert.ok(started.length < 10, `only the in-flight batch should have started, got ${started.length}`);
});

test("an empty selection makes no calls", async () => {
  let calls = 0;
  assert.deepEqual(await mapWithLimit([], 4, async () => (calls += 1)), []);
  assert.equal(calls, 0);
});

test("a newer request aborts the older one and only the newest is current", () => {
  const guard = latestRequest();
  const first = guard.start();
  const second = guard.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  guard.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});

test("an out-of-order older answer cannot overwrite the newer one", async () => {
  const guard = latestRequest();
  let shown = "";
  const search = async (q: string, delay: number) => {
    const request = guard.start();
    await tick(delay);
    if (request.isCurrent()) shown = q;
  };
  await Promise.all([search("ah", 20), search("ahm", 1)]);
  assert.equal(shown, "ahm");
});

test("the admin panels use the bounded and latest-wins helpers", () => {
  const panel = readFileSync("src/components/shared-admin/students-panel.tsx", "utf8");
  assert.doesNotMatch(panel, /Promise\.all\(\[\.\.\.selected\]\.map/);
  assert.doesNotMatch(panel, /for \(const id of ids\)/);
  assert.equal((panel.match(/mapWithLimit\(/g) || []).length, 2);

  const admin = readFileSync("src/components/shared-admin/index.tsx", "utf8");
  assert.match(admin, /if \(q\.length < 2\)/);
  assert.match(admin, /signal: request\.signal/);
  assert.doesNotMatch(admin, /const balRes = await read\(/);
});

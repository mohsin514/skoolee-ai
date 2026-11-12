import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runBounded } from "../../src/lib/bounded-pool";

// SKAI-1863: "Send reminders to all" posted one reminder per family strictly one after another.
const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("never runs more than the limit at once and tries every item exactly once", async () => {
  const seen: number[] = [];
  let inFlight = 0, peak = 0;
  await runBounded(Array.from({ length: 23 }, (_, i) => i), 4, async (item) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await tick(2);
    seen.push(item);
    inFlight -= 1;
  });
  assert.equal(peak, 4);
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i));
});

test("wall time grows with items/limit, not with the item count", async () => {
  const started = Date.now();
  await runBounded(Array.from({ length: 40 }, (_, i) => i), 4, () => tick(10));
  // Serial would be about 400ms; ten waves of four is about 100ms.
  assert.ok(Date.now() - started < 300, `took ${Date.now() - started}ms`);
});

test("a failing item does not stop the rest", async () => {
  let done = 0;
  await runBounded([1, 2, 3, 4, 5], 2, async (item) => { if (item === 2) throw new Error("provider down"); done += 1; });
  assert.equal(done, 4);
});

test("empty lists and odd limits are safe", async () => {
  await runBounded([], 4, async () => { throw new Error("must not run"); });
  let calls = 0;
  await runBounded([1, 2], 0, async () => { calls += 1; });
  assert.equal(calls, 2);
});

test("the defaulters report sends reminders through the bounded pool, one request per family", () => {
  const ui = readFileSync("src/components/fees/FeeReportsTab.tsx", "utf8");
  const body = ui.slice(ui.indexOf("const remindAll = async"), ui.indexOf("const handleExport = async"));
  assert.match(body, /await runBounded\(everyone, REMIND_ALL_CONCURRENCY, async \(d\) => \{/);
  assert.match(body, /body: JSON\.stringify\(\{ studentId: d\.studentId \}\)/);
  assert.doesNotMatch(body, /for \(const d of everyone\)/);
  assert.match(ui, /const REMIND_ALL_CONCURRENCY = 4;/);
  assert.match(body, /if \(res\.ok && json\.success\) sent \+= 1; else failedCount \+= 1;/);
  assert.match(body, /catch \{ failedCount \+= 1; \}/);
});

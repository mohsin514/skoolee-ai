import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1667: a failed "Concerns I recorded" load shows Retry and never clears known rows.
const source = readFileSync("src/components/care/care.tsx", "utf8");

test("failure marks the history failed instead of emptying it", () => {
  assert.doesNotMatch(source, /\.catch\(\(\) => setMine\(\[\]\)\)/);
  assert.match(source, /\.then\(rows => \{ setMine\(rows\); setMineFailed\(false\); \}\)\.catch\(error => \{ if \(error instanceof AccessError\) \{ setMine\(\[\]\); setMineFailed\(false\); \} else setMineFailed\(true\); \}\)/);
});

test("Retry re-runs the load and the copy distinguishes stale from never loaded", () => {
  assert.match(source, /\{mineFailed \? <div data-care-mine-failed>.*onClick=\{\(\) => void loadMine\(\)\}/);
  assert.match(source, /mine\.length \? ui\("Concerns I recorded could not be refreshed\. The list below may be out of date\."\) : ui\("Concerns I recorded could not be loaded\."\)/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1642: a missed check-in in the queue links to its own plan in Learning actions, not back to overview.
const queue = readFileSync("src/lib/principal/queue.ts", "utf8");
const workspace = readFileSync("src/components/learning/learning-actions.tsx", "utf8");

test("SUPPORT_CHECKIN items link to the learning-actions view for their plan", () => {
  const line = queue.split("\n").find(l => l.includes("key: `SUPPORT_CHECKIN:"));
  assert.ok(line);
  assert.match(line, /link: link\("learning-actions", \{ plan: plan\.id \}\)/);
  assert.doesNotMatch(line, /link\("overview"\)/);
});

test("Learning actions opens the plan named in ?plan=", () => {
  assert.match(workspace, /new URLSearchParams\(window\.location\.search\)\.get\("plan"\); if \(plan\) setOpen\(plan\)/);
});

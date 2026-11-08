import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1785: cancelling a place must not hide that learner's saved session attendance.
const ui = readFileSync("src/components/activities/activities.tsx", "utf8");
const sessions = ui.slice(ui.indexOf("data-activity-sessions"), ui.indexOf("data-activity-sessions") + 2500);

test("a session lists confirmed learners plus anyone with a saved mark in it", () => {
  assert.match(sessions, /roster\.places\.filter\(p => p\.status === "CONFIRMED" \|\| s\.marks\.some\(m => m\.studentId === p\.studentId\)\)/);
});

test("only a confirmed learner on a running activity gets Present/Absent controls; others read-only", () => {
  assert.match(sessions, /\{running && p\.status === "CONFIRMED" \? \["PRESENT", "ABSENT"\]/);
  assert.match(sessions, /: <span className="text-ink-muted">\{mark === "PRESENT" \? ui\("Present"\) : mark === "ABSENT" \? ui\("Absent"\) : "—"\}<\/span>/);
});

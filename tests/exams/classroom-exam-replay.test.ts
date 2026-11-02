import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("SKAI-239 a repeated quiz/class-test create replays the recent identical exam without re-notifying", () => {
  const src = readFileSync("src/lib/exams/create-command.ts", "utf8");
  assert.match(src, /activatedAt: \{ gte: new Date\(Date\.now\(\) - REPLAY_WINDOW_MS\) \}/);
  assert.match(src, /if \(recent\) return \{ exam: recent, replayed: true \};/);
  assert.ok(src.indexOf("if (replayed) return exam;") < src.indexOf('notify("EXAM_CREATED"'), "a replay sends no second notification");
  assert.match(src, /This class already has this term exam/, "term exams still refuse duplicates with 409");
});

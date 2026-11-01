import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1561: reschedule, cancel and mark-done buttons name their meeting or task.
const src = readFileSync("src/components/meetings/family-meetings.tsx", "utf8");

test("meeting and action buttons carry their target in a screen-reader suffix", () => {
  assert.match(src, /data-meeting-move>\{ui\("Choose a new time"\)\}<span className="sr-only">: <bdi>\{b\.teacherName\}<\/bdi>/);
  assert.match(src, /data-meeting-cancel>\{ui\("Cancel meeting"\)\}<span className="sr-only">: <bdi>\{b\.teacherName\}<\/bdi> · <bdi>\{slotLabel\(/);
  assert.match(src, /data-action-done>\{ui\("Mark done"\)\}<span className="sr-only">: <bdi>\{a\.text\}<\/bdi><\/span>/);
});

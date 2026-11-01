import assert from "node:assert/strict";
import { test } from "node:test";
import { mondayOf } from "@/lib/family/week";

test("the digest week is the Monday of the staff member's calendar week", () => {
  assert.equal(mondayOf(new Date(2026, 9, 26, 0, 30)), "2026-10-26"); // Monday just after midnight
  assert.equal(mondayOf(new Date(2026, 10, 1, 23, 45)), "2026-10-26"); // Sunday late evening stays in the same week
  assert.equal(mondayOf(new Date(2026, 9, 31, 12, 0)), "2026-10-26"); // Saturday
});

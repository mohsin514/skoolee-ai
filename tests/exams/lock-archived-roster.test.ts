import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SKAI-1299: locking an exam counts only active learners", () => {
  const source = readFileSync("src/app/api/exams/[id]/lock/route.ts", "utf8");
  // The class roster that drives the expected mark count must exclude archived learners.
  assert.match(source, /students: \{ where: \{ archivedAt: null \}, select: \{ id: true \} \}/);
  // No roster read in the lock route may include archived learners.
  assert.doesNotMatch(source, /students: \{ select: \{ id: true \} \}/);
});

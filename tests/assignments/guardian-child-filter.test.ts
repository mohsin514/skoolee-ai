import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listInput } from "@/lib/assignments/service";

// SKAI-2171: Homework & resources follows the guardian's chosen child; the filter only narrows their own children.
test("the assignment list accepts a studentId filter", () => {
  assert.deepEqual(listInput.parse({ studentId: "s1" }), { studentId: "s1" });
  assert.throws(() => listInput.parse({ studentId: "" }));
});
test("the filter narrows the guardian's linked children and never widens them", () => {
  const src = readFileSync("src/lib/assignments/service.ts", "utf8");
  assert.match(src, /\(await learnerStudents\(tx, user\)\)\.filter\(s => user\.role !== "PARENT" \|\| !input\.studentId \|\| s\.id === input\.studentId\)/);
  const ui = readFileSync("src/components/assignments/LearnerAssignments.tsx", "utf8");
  assert.match(ui, /audience === "guardian" && selectedStudentId/);
});

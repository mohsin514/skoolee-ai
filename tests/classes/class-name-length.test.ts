import assert from "node:assert/strict";
import test from "node:test";
import { classSchema } from "../../src/lib/validators/schemas";

// SKAI-2007: class name and section are capped at 80 and 40 characters.
test("class name and section have a maximum length", () => {
  assert.equal(classSchema.safeParse({ name: "N".repeat(80), section: "S".repeat(40), academicYear: 2026 }).success, true);
  assert.equal(classSchema.safeParse({ name: "N".repeat(81), academicYear: 2026 }).success, false);
  assert.equal(classSchema.safeParse({ name: "Grade 5", section: "S".repeat(41), academicYear: 2026 }).success, false);
});

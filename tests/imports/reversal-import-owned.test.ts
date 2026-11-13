import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1224: the enrollment and guardian link a roster commit creates must not block reversing that commit.
const src = readFileSync("src/app/api/import-batches/[batchId]/route.ts", "utf8");

test("only references beyond what the import created block reversal", () => {
  assert.match(src, /IMPORT_OWNED_REFERENCES: Record<string, number> = \{ enrollments: 1, guardianRelationships: 1 \}/);
  assert.equal(src.split("laterReferences(").length - 1, 3, "definition, analysis and in-transaction recheck");
  assert.doesNotMatch(src, /Object\.values\(student\._count\)\.some/);
});

test("the import's enrollment is removed before its pupils, inside the claimed transaction", () => {
  const claim = src.indexOf('if (!claimed.count) throw new ApiError("This batch was already reversed", 409);');
  const enrol = src.indexOf("tx.studentEnrollment.deleteMany({ where: { studentId: { in: studentIds }, schoolId: user.schoolId } })");
  const pupils = src.indexOf("tx.student.deleteMany(");
  assert.ok(claim > 0 && claim < enrol && enrol < pupils);
});

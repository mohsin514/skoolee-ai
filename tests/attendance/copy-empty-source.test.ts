import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1547: copying from a day with no register is rejected before any write or audit.
const src = readFileSync("src/lib/school-ai/school-operations-register-write.ts", "utf8");

test("an empty source register throws 409 before preview, apply and the audit row", () => {
  const guard = src.indexOf("if (input.copyFrom && !entries?.length) throw new ApiError(");
  assert.ok(guard > 0, "guard present");
  assert.ok(guard < src.indexOf("attendanceProposalSchema.parse"), "before the proposal");
  assert.ok(guard < src.indexOf("applySchoolOperations(user, preview, tx)"), "before apply");
  assert.ok(guard < src.indexOf("tx.auditLog.create"), "before the audit row");
  assert.match(src.slice(guard, guard + 220), /, 409\);/);
});

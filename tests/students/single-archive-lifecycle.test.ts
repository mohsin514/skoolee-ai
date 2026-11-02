import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1601: archiving through the single-record PATCH sets archivedAt like the bulk path.
const src = readFileSync("src/app/api/students/route.ts", "utf8");
const single = src.slice(src.indexOf("studentProfileUpdateSchema.parse(body)"));

test("the single update reads archivedAt for the existing pupil", () => {
  assert.match(single, /select: \{ id: true, campusId: true, classId: true, status: true, archivedAt: true,/);
});

test("archiving sets archivedAt and a reason, behind the delete permission", () => {
  assert.match(single, /if \(updates\.status === "archived" && !existing\.archivedAt\) \{\n\s*await assertPermission\(user, "students", "delete"\);\n\s*data\.archivedAt = new Date\(\);\n\s*data\.archiveReason = "Administrative archive";/);
});

test("an archived pupil cannot be un-archived here; restore re-checks identifiers", () => {
  assert.match(single, /else if \(existing\.archivedAt && updates\.status !== "archived"\) \{\n\s*throw new ApiError\("Restore this pupil first; restoring re-checks their roll and admission numbers\.", 409\);/);
});

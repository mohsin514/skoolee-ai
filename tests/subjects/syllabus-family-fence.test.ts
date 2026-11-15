import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2054: GET /api/subjects/[id]/syllabus is a staff-only read, like GET /api/subjects.
test("syllabus GET denies student and guardian accounts before reading topics", () => {
  const route = readFileSync("src/app/api/subjects/[subjectId]/syllabus/route.ts", "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("syllabusTopic.findMany"));
  assert.match(get, /assertStaffRole\(user\)/);
});

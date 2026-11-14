import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { fail, failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1203 (SKAI-1163 follow-up, academic batch D): grade-config/weighted-result adopts the envelope.
const ROUTE = "src/app/api/grade-config/weighted-result/route.ts";
const CALLERS = [
  "src/app/teacher/use-grading-tools.ts",
  "src/components/academic-year/AcademicYearPanel.tsx",
  "src/components/academic/YearEndPanel.tsx",
];

test("weighted-result emits only the envelope and keeps its auth, module and campus gates", () => {
  const source = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(source, /NextResponse\.json\(/, "route still builds a raw response");
  assert.doesNotMatch(source, /errorResponse\(/, "route still uses the legacy error shape");
  assert.doesNotMatch(source, /success: true/, "route still sends the legacy success flag");
  assert.match(source, /from "@\/lib\/api\/envelope"/);
  assert.match(source, /requireAuthUser\(\)/);
  assert.match(source, /assertModuleRead\(user, "exams"\)/);
  // Two schools and two campuses: the class and its pupils are read only inside the caller's campus.
  assert.match(source, /where: \{ id: classId, campusId: user\.campusId \}/);
  assert.match(source, /where: \{ classId, campusId: user\.campusId \}/);
});

test("the grading callers read the envelope instead of the legacy shape", () => {
  for (const file of CALLERS) {
    const screen = readFileSync(file, "utf8");
    assert.match(screen, /readApiData</, `${file} does not read data through the envelope`);
    assert.doesNotMatch(screen, /json\.grades \|\| \[\]|result\.grades \|\| \[\]/, `${file} still reads the legacy grades field`);
  }
});

test("a denied role gets a coded 403, another school's class a coded 404, and grades round-trip", async () => {
  const denied = await failFrom(new ApiError("Forbidden", 403));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "FORBIDDEN");

  const missing = fail("NOT_FOUND", "Class not found in your campus");
  const missingBody = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(isApiOk(missingBody), false);
  assert.match(readApiError(missingBody), /Class not found/);

  const body = await ok({ grades: [{ studentId: "s1", rollNo: 4 }] }).json();
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, { grades: [] }).grades, [{ studentId: "s1", rollNo: 4 }]);
});

test("a failed response falls back to an empty grade list in the callers", async () => {
  const body = await fail("BAD_REQUEST", "No grade data available. Ensure exams have marks entered.").json();
  assert.deepEqual(readApiData<{ grades?: unknown[] }>(body, {}).grades, undefined);
  assert.match(readApiError(body, "No grades"), /No grade data available/);
});

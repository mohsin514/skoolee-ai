import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { fail, failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1203 (SKAI-1163 follow-up, academic batch A): planning, question network and calculated grades adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/planning/route.ts", "src/app/api/question-network/route.ts", "src/app/api/calculated-grades/route.ts"];

test("adopted academic routes emit only the envelope and keep their auth gate", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
    assert.match(source, /requireAuthUser\(\)/);
  }
  // The campus scoping from SKAI-214 stays in place: a class or pupil of another school/campus is a 404.
  const grades = readFileSync("src/app/api/calculated-grades/route.ts", "utf8");
  assert.match(grades, /campusId: session\.campusId/);
  assert.match(grades, /assertModuleRead\(session, "exams"\)/);
});

test("the planning and question network screens read the envelope", () => {
  for (const file of ["src/components/planning/scenario-planner.tsx", "src/components/question-network/question-network.tsx"]) {
    const screen = readFileSync(file, "utf8");
    assert.doesNotMatch(screen, /json\?\.success\b/);
    assert.match(screen, /readApiError\(json\)/);
  }
});

test("a denied role gets the coded 403, another school's class a coded 404, and data round-trips", async () => {
  const denied = await failFrom(new ApiError("Forbidden", 403));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "FORBIDDEN");
  const missing = fail("NOT_FOUND", "Class not found in your campus");
  assert.equal(missing.status, 404);
  const missingBody = await missing.json();
  assert.equal(isApiOk(missingBody), false);
  assert.match(readApiError(missingBody), /Class not found/);
  const body = await ok({ grades: [{ studentId: "s1" }] }).json();
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, null), { grades: [{ studentId: "s1" }] });
});

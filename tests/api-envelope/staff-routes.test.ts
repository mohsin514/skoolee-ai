import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1213: the staff/* routes adopt the envelope; their callers read it through the shared readers.
const ROUTES = ["route", "appointments/route", "cover/route", "departments/route", "designations/route", "documents/route", "hierarchy/route", "profile/route", "reporting-lines/route", "workload/route"].map(name => `src/app/api/staff/${name}.ts`);
const CALLERS = ["staff/department-manager", "staff/designation-ladder", "staff/position-dialog", "staff/position-fields", "staff/hierarchy-panel", "staff/workload-cover", "timetable/TimetablePanel", "timetable/TimetableStudio"].map(name => `src/components/${name}.tsx`);

test("staff routes emit only the envelope", () => {
  for (const file of ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("staff callers read through the shared readers, not `success` or a string `error`", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /from "@\/lib\/api\/envelope-client"/, `${file} must use the envelope readers`);
    assert.doesNotMatch(source, file.includes("timetable") ? /teacherJson\.success/ : /(json|data|payload)\??\.success\b/, `${file} still requires the legacy success flag`);
    if (!file.includes("timetable")) assert.doesNotMatch(source, /(json|data|payload)\??\.error \|\|/, `${file} still reads a string error`);
  }
});

test("a retired unit's message and a list payload survive the envelope", async () => {
  const body = await ok({ retired: true, message: "Archived rather than deleted." }).json();
  assert.ok(isApiOk(body));
  assert.equal(readApiData<{ message?: string }>(body, {}).message, "Archived rather than deleted.");
  const list = await ok({ staff: [{ id: "t-1", role: "TEACHER" }], invitations: [] }).json();
  assert.equal(readApiData<{ staff: unknown[] }>(list, { staff: [] }).staff.length, 1);
});

test("a denied staff write reaches the screen as its message with a FORBIDDEN code", async () => {
  const res = await failFrom(new ApiError("Only school admins can change the staff ladder", 403));
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
  assert.equal(readApiError(body), "Only school admins can change the staff ladder");
  assert.equal(isApiOk(body), false);
});

test("a refused invite action becomes an envelope error, not a 200 with success false", () => {
  const source = readFileSync("src/app/api/staff/route.ts", "utf8");
  assert.match(source, /if \(!success\) return fail\("BAD_REQUEST"/);
});

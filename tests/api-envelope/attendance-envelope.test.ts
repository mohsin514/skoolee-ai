import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { created, fail, failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1214: the attendance and teacher-attendance routes move to the envelope; their clients read it through the shared helpers.
const ROUTES = [
  "src/app/api/attendance/route.ts",
  "src/app/api/attendance/copy-previous/route.ts",
  "src/app/api/attendance/follow-up/route.ts",
  "src/app/api/attendance/history/route.ts",
  "src/app/api/attendance/leave/route.ts",
  "src/app/api/attendance/monthly/route.ts",
  "src/app/api/attendance/register/route.ts",
  "src/app/api/attendance/school-summary/route.ts",
  "src/app/api/teacher-attendance/route.ts",
];
const CLIENTS = [
  "src/components/attendance/class-register.tsx",
  "src/components/attendance/attendance-overview.tsx",
  "src/components/attendance/unified-attendance-panel.tsx",
  "src/app/teacher/page.tsx",
  "src/app/teacher/attendance/page.tsx",
];

test("attendance routes emit only the envelope", () => {
  for (const route of ROUTES) {
    const source = readFileSync(route, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${route} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${route} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/, `${route} must import the envelope`);
  }
});

test("attendance clients read the envelope, not the legacy success flag", () => {
  for (const client of CLIENTS) {
    const source = readFileSync(client, "utf8");
    assert.doesNotMatch(source, /!json\.success|json\.success &&|json\.success\)/, `${client} still reads json.success`);
    assert.match(source, /from "@\/lib\/api\/envelope-client"/, `${client} must use the shared readers`);
  }
});

test("teacher-attendance success is { data: { items, summary } } and errors keep their code", async () => {
  const body = await ok({ items: [{ id: "ta1" }], summary: { total: 1 } }).json();
  assert.deepEqual(body, { data: { items: [{ id: "ta1" }], summary: { total: 1 } } });
  assert.deepEqual(readApiData<{ items: unknown[] } | null>(body, null)?.items, [{ id: "ta1" }]);
  assert.equal(isApiOk(body), true);

  const created201 = await created({ items: [], message: "Marked 0 records" }).json();
  assert.deepEqual(created201, { data: { items: [], message: "Marked 0 records" } });

  const denied = await (await failFrom(new ApiError("Forbidden", 403))).json();
  assert.deepEqual(denied, { error: { code: "FORBIDDEN", message: "Forbidden" } });
  assert.equal(readApiData(denied, null), null);
  assert.equal(isApiOk(denied), false);
  assert.equal(readApiError(denied), "Forbidden");

  const invalid = await fail("VALIDATION_FAILED", "Invalid attendance", { status: ["Required"] }).json();
  assert.deepEqual(invalid, { error: { code: "VALIDATION_FAILED", message: "Invalid attendance", fields: { status: ["Required"] } } });
});

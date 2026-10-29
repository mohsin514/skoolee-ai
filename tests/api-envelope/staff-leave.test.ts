import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { created, failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1206 (SKAI-1163 batch 3): leave and teacher-evidence routes adopt the envelope.
const ADOPTED_ROUTES = [
  "src/app/api/leave/route.ts",
  "src/app/api/leave/types/route.ts",
  "src/app/api/leave/allocations/route.ts",
  "src/app/api/leave/review/route.ts",
  "src/app/api/teachers/availability/route.ts",
  "src/app/api/teachers/performance/route.ts",
  "src/app/api/teachers/performance/notes/route.ts",
];
const CALLERS = ["src/components/leave/my-leave.tsx", "src/components/academic-year/TeacherPerformancePanel.tsx"];

test("batch 3 routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("batch 3 callers no longer require the legacy success flag", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /json\??\.success\b/, `${file} still reads json.success`);
    assert.match(source, /isApiOk\(json\)/);
  }
  const admin = readFileSync("src/components/shared-admin/index.tsx", "utf8");
  assert.doesNotMatch(admin, /(reqRes|typesRes|allocRes|balRes)\??\.json\.success/);
});

test("isApiOk accepts both shapes and rejects errors", async () => {
  assert.equal(isApiOk(await ok({ requests: [] }).json()), true);
  assert.equal(isApiOk(await created({ id: "l1" }).json()), true);
  assert.equal(isApiOk({ success: true, data: [] }), true);
  assert.equal(isApiOk({ success: false }), false);
  assert.equal(isApiOk({ items: [] }), false);
  assert.equal(isApiOk(null), false);
  const denied = await (await failFrom(new ApiError("Insufficient balance", 400))).json();
  assert.equal(isApiOk(denied), false);
  assert.equal(readApiError(denied, "Could not send"), "Insufficient balance");
});

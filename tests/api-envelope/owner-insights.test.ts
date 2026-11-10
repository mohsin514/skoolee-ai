import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok, okPage } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1208 (SKAI-1163 follow-up, owner batch A): platform insight, pilot and session routes adopt the envelope.
const ADOPTED_ROUTES = [
  "src/app/api/owner/stats/route.ts",
  "src/app/api/owner/audit-logs/route.ts",
  "src/app/api/owner/sessions/route.ts",
  "src/app/api/owner/ai-cost-report/route.ts",
  "src/app/api/owner/curriculum-packs/route.ts",
  "src/app/api/owner/expansion-triggers/route.ts",
  "src/app/api/owner/pack-expansion/route.ts",
  "src/app/api/owner/pilot-go-no-go/route.ts",
  "src/app/api/owner/pilot-readiness/route.ts",
];
const CALLERS = [
  "src/components/owner/PilotReadinessConsole.tsx",
  "src/components/owner/PilotGoNoGoBoard.tsx",
  "src/components/owner/AiCostReport.tsx",
  "src/app/owner/expansion/page.tsx",
  "src/app/owner/expansion/triggers/page.tsx",
];

test("owner batch A routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("owner batch A callers no longer require the legacy success flag", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /json\??\.success\b/, `${file} still reads json.success`);
    assert.match(source, /isApiOk\(json\)/);
  }
  const page = readFileSync("src/app/owner/page.tsx", "utf8");
  for (const route of ["stats", "audit-logs", "sessions"]) {
    const at = page.indexOf(`/api/owner/${route}`);
    assert.doesNotMatch(page.slice(at, at + 400), /json\.success/, `owner page still reads json.success for ${route}`);
  }
});

test("a denied owner read surfaces its message to the caller", async () => {
  const denied = await (await failFrom(new ApiError("Platform owner access required", 403))).json();
  assert.equal(isApiOk(denied), false);
  assert.equal(denied.error.code, "FORBIDDEN");
  assert.equal(readApiError(denied, "Could not load"), "Platform owner access required");
  assert.equal(isApiOk(await ok({ board: [] }).json()), true);
  const page = await okPage([{ id: "s1" }], { page: 1, limit: 50, total: 1, pages: 1 }).json();
  assert.equal(isApiOk(page), true);
  assert.deepEqual(readApiData(page, []), [{ id: "s1" }]);
});

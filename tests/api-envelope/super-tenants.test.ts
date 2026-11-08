import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, okPage } from "../../src/lib/api/envelope";
import { readApiData, readApiError, readApiErrorCode } from "../../src/lib/api/envelope-client";

// SKAI-1208 (SKAI-1163 follow-up): group-admin (super) and tenant routes adopt the envelope.
const ADOPTED_ROUTES = [
  "src/app/api/super/active-campus/route.ts",
  "src/app/api/super/audit-logs/route.ts",
  "src/app/api/super/sessions/route.ts",
  "src/app/api/super/stats/route.ts",
  "src/app/api/super/support-grants/route.ts",
  "src/app/api/super/users/route.ts",
  "src/app/api/super/users/[id]/password/route.ts",
  "src/app/api/tenants/route.ts",
];

test("super and tenant routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
});

test("support approvals read the envelope error, not the raw error field", () => {
  const source = readFileSync("src/components/institution/support-approvals.tsx", "utf8");
  assert.doesNotMatch(source, /json\.error\b/);
  assert.match(source, /readApiError\(json/);
});

test("a paged list keeps data and pagination side by side", async () => {
  const body = await okPage([{ id: "u1" }], { page: 1, limit: 20, total: 1, pages: 1 }).json();
  assert.deepEqual(readApiData(body, []), [{ id: "u1" }]);
  assert.equal(body.pagination.total, 1);
});

test("the MFA refusal keeps its machine code through the envelope", async () => {
  const body = await (await failFrom(new ApiError("Turn on two-step sign-in before you review support access.", 403, "MFA_REQUIRED"))).json();
  assert.equal(readApiErrorCode(body), "MFA_REQUIRED");
  assert.equal(readApiError(body), "Turn on two-step sign-in before you review support access.");
});

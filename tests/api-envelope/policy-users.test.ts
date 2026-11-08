import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1206 (SKAI-1163 batch 4): users, group-policy and policies routes adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/users/route.ts", "src/app/api/group-policy/route.ts", "src/app/api/policies/route.ts"];
const CALLERS = ["src/components/group-policy/group-policy.tsx", "src/components/policies/policy-manager.tsx", "src/components/policies/policy-assistant.tsx"];

test("batch 4 routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
  }
  assert.match(readFileSync("src/app/api/users/route.ts", "utf8"), /parseBody\(/, "users keeps SKAI-1161 validation");
});

test("batch 4 callers no longer require the legacy success flag", () => {
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /json\??\.success\b/, `${file} still reads json.success`);
    assert.match(source, /readApiError\(json/);
  }
  assert.match(readFileSync("src/app/admin/page.tsx", "utf8"), /readApiError\(result, failed\)/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom } from "../../src/lib/api/envelope";
import { isApiOk, readApiError, readApiFields } from "../../src/lib/api/envelope-client";

// SKAI-1208 (SKAI-1163 follow-up, owner batch B): platform pricing and capacity routes adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/owner/platform-config/route.ts", "src/app/api/owner/capacity/route.ts"];

test("owner batch B routes emit only the envelope", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
    assert.match(source, /requirePlatformOwner\(\)/);
  }
});

test("pricing and capacity callers read the envelope", () => {
  const capacity = readFileSync("src/components/owner/CapacityReport.tsx", "utf8");
  assert.doesNotMatch(capacity, /json\.success\b/);
  assert.match(capacity, /readApiError\(json/);
  const page = readFileSync("src/app/owner/page.tsx", "utf8");
  for (const at of [...page.matchAll(/\/api\/owner\/platform-config/g)].map((m) => m.index ?? 0)) {
    assert.doesNotMatch(page.slice(at, at + 500), /json\.(success|error)\b/);
  }
});

test("a rejected price keeps its message for the owner", async () => {
  const body = await (await failFrom(new ApiError("Provide valid plan prices: each price must be a finite non-negative number", 400))).json();
  assert.equal(isApiOk(body), false);
  assert.equal(body.error.code, "BAD_REQUEST");
  assert.equal(readApiFields(body), undefined);
  assert.match(readApiError(body), /valid plan prices/);
});

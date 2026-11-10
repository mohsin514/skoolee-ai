import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1208 (SKAI-1163 follow-up, owner batch C): pilot evidence routes adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/owner/pilots/route.ts", "src/app/api/owner/pilots/[id]/route.ts", "src/app/api/owner/pilots/export/route.ts"];

test("pilot routes emit only the envelope and stay owner-only", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
    assert.match(source, /requirePlatformOwner\(\)/);
  }
});

test("the pilot screen reads the envelope", () => {
  const screen = readFileSync("src/components/owner/PilotEvidence.tsx", "utf8");
  assert.doesNotMatch(screen, /json\?\.success\b/);
  assert.match(screen, /readApiError\(json\)/);
});

test("a denied school admin gets the coded 403 and a refused claim keeps its reason", async () => {
  const denied = await failFrom(new ApiError("Forbidden", 403));
  assert.equal(denied.status, 403);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.error.code, "FORBIDDEN");
  const refused = await (await failFrom(new ApiError("Too few paired observations", 400))).json();
  assert.equal(isApiOk(refused), false);
  assert.match(readApiError(refused), /Too few paired observations/);
  assert.equal(isApiOk(await ok({ pilots: [] }).json()), true);
});

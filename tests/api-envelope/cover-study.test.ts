import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiData, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1203 (SKAI-1163 follow-up, batch B): cover and study routes adopt the envelope.
const ADOPTED_ROUTES = ["src/app/api/cover/route.ts", "src/app/api/cover/campus/route.ts", "src/app/api/study/route.ts", "src/app/api/study/teacher/route.ts"];
const ADOPTED_SCREENS = ["src/components/cover/my-cover.tsx", "src/components/cover/cover-follow-up.tsx", "src/components/study/study-assistant.tsx"];

test("adopted cover and study routes emit only the envelope and keep their auth gate", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(/, `${file} still builds a raw response`);
    assert.doesNotMatch(source, /errorResponse\(/, `${file} still uses the legacy error shape`);
    assert.doesNotMatch(source, /success: true/, `${file} still sends the legacy success flag`);
    assert.match(source, /from "@\/lib\/api\/envelope"/);
    assert.match(source, /requireAuthUser\(\)/);
  }
  // Teachers' cover and the study desk keep their role gates: a student or parent is a 404.
  assert.match(readFileSync("src/app/api/cover/route.ts", "utf8"), /user\.role === "PARENT" \|\| user\.role === "STUDENT"/);
  assert.match(readFileSync("src/app/api/study/teacher/route.ts", "utf8"), /user\.role === "STUDENT" \|\| user\.role === "PARENT"/);
});

test("the cover and study screens read the envelope", () => {
  for (const file of ADOPTED_SCREENS) {
    const screen = readFileSync(file, "utf8");
    assert.doesNotMatch(screen, /\bjson\.success\b|\bj\.success\b/);
    assert.match(screen, /isApiOk\(/);
    assert.match(screen, /readApiError\(/);
  }
});

test("a denied role gets a coded 404, and cover data round-trips", async () => {
  const denied = await failFrom(new ApiError("Not found", 404));
  assert.equal(denied.status, 404);
  assert.equal((await denied.json()).error.code, "NOT_FOUND");
  const body = await ok({ dutyId: "d1", updatedAt: "2026-11-13" }).json();
  assert.equal(isApiOk(body), true);
  assert.deepEqual(readApiData(body, null), { dutyId: "d1", updatedAt: "2026-11-13" });
  const failed = await failFrom(new ApiError("Unknown action", 400));
  assert.match(readApiError(await failed.json()), /Unknown action/);
});

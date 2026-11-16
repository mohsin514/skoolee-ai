import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { failFrom, ok } from "../../src/lib/api/envelope";
import { isApiOk, readApiError } from "../../src/lib/api/envelope-client";

// SKAI-1204 (SKAI-1163 follow-up): the student Today route adopts the envelope.
const ROUTE = "src/app/api/student/today/route.ts";

test("the student Today route emits only the envelope", () => {
  const source = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(source, /Response\.json\(/);
  assert.doesNotMatch(source, /errorResponse\(/);
  assert.doesNotMatch(source, /success: true/);
  assert.match(source, /from "@\/lib\/api\/envelope"/);
});

test("the Today client reads the envelope", () => {
  const source = readFileSync("src/components/student/student-today.tsx", "utf8");
  assert.doesNotMatch(source, /json\.success/);
  assert.match(source, /isApiOk\(json\)/);
  assert.match(source, /readApiError\(json, "Today could not be refreshed\."\)/);
});

test("a Today success body reads as data and a denied body as its message", async () => {
  const body = await ok({ day: "2026-11-14", lessons: [] }).json();
  assert.deepEqual(body, { data: { day: "2026-11-14", lessons: [] } });
  assert.equal(isApiOk(body), true);

  const denied = await failFrom(new ApiError("Access denied", 403)).then(r => r.json());
  assert.equal(isApiOk(denied), false);
  assert.equal(readApiError(denied, "Today could not be refreshed."), "Access denied");
});

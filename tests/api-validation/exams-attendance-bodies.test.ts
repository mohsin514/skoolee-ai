import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: exam and attendance write routes.
const ADOPTED_ROUTES = [
  "src/app/api/attendance/copy-previous/route.ts",
  "src/app/api/attendance/route.ts",
  "src/app/api/exams/route.ts",
  "src/app/api/marks/route.ts",
  "src/app/api/teacher-attendance/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("exam and attendance routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("exam and attendance routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("exam and attendance id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("exam and attendance write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});

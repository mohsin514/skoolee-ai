import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: student and staff write routes.
const ADOPTED_ROUTES = [
  "src/app/api/staff/cover/route.ts",
  "src/app/api/staff/departments/route.ts",
  "src/app/api/staff/designations/route.ts",
  "src/app/api/staff/documents/route.ts",
  "src/app/api/staff/hierarchy/route.ts",
  "src/app/api/staff/profile/route.ts",
  "src/app/api/staff/reporting-lines/route.ts",
  "src/app/api/staff/route.ts",
  "src/app/api/staff/workload/route.ts",
  "src/app/api/students/[id]/guardians/route.ts",
  "src/app/api/students/consolidation/route.ts",
  "src/app/api/students/documents/route.ts",
  "src/app/api/students/enrollments/route.ts",
  "src/app/api/students/timeline/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("student and staff routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("student and staff routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("student and staff id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("student and staff write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: academic, class and subject write routes.
const ADOPTED_ROUTES = [
  "src/app/api/academic-cycle/route.ts",
  "src/app/api/academic-models/[id]/route.ts",
  "src/app/api/academic-models/route.ts",
  "src/app/api/academic-year/route.ts",
  "src/app/api/academic/calendar/route.ts",
  "src/app/api/academic/datesheet-publication/route.ts",
  "src/app/api/academic/exam-schedule/bulk/route.ts",
  "src/app/api/academic/exam-schedule/rooms/route.ts",
  "src/app/api/academic/exam-schedule/route.ts",
  "src/app/api/academic/exam-sessions/route.ts",
  "src/app/api/academic/exam-sessions/seating/route.ts",
  "src/app/api/academic/periods/route.ts",
  "src/app/api/academic/rollover/route.ts",
  "src/app/api/academic/rooms/route.ts",
  "src/app/api/classes/route.ts",
  "src/app/api/grade-config/route.ts",
  "src/app/api/student-categories/route.ts",
  "src/app/api/student-groups/route.ts",
  "src/app/api/subjects/[subjectId]/syllabus/route.ts",
  "src/app/api/subjects/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("academic, class and subject routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("academic, class and subject routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("academic, class and subject id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("academic, class and subject write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)(?!\.catch)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});

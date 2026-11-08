import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: operations write routes.
const ADOPTED_ROUTES = [
  "src/app/api/accommodations/[planId]/support/route.ts",
  "src/app/api/accommodations/route.ts",
  "src/app/api/admission-queries/route.ts",
  "src/app/api/admissions/route.ts",
  "src/app/api/assignments/[id]/route.ts",
  "src/app/api/assignments/route.ts",
  "src/app/api/communications/route.ts",
  "src/app/api/corrections/route.ts",
  "src/app/api/curriculum/map/route.ts",
  "src/app/api/dormitory/allocations/route.ts",
  "src/app/api/dormitory/room-types/route.ts",
  "src/app/api/dormitory/rooms/route.ts",
  "src/app/api/front-desk/certificates/route.ts",
  "src/app/api/front-desk/complaints/route.ts",
  "src/app/api/front-desk/phone-calls/route.ts",
  "src/app/api/front-desk/postal/route.ts",
  "src/app/api/front-desk/visitors/route.ts",
  "src/app/api/import-batches/[batchId]/route.ts",
  "src/app/api/import-batches/route.ts",
  "src/app/api/notifications/route.ts",
  "src/app/api/principal/queue/route.ts",
  "src/app/api/readiness/route.ts",
  "src/app/api/reports/[id]/route.ts",
  "src/app/api/reports/generate-from-grades/route.ts",
  "src/app/api/reports/route.ts",
  "src/app/api/resources/[id]/route.ts",
  "src/app/api/resources/route.ts",
  "src/app/api/timetable/[id]/route.ts",
  "src/app/api/timetable/[id]/suggestions/route.ts",
  "src/app/api/timetable/route.ts",
  "src/app/api/transport/vehicles/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("operations routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("operations routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("operations id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("operations write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)(?!\.catch)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});

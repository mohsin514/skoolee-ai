import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1441: safeguarding oversight logs are limited to the lead's campus.
const service = readFileSync("src/lib/care/service.ts", "utf8");
const oversight = service.slice(service.indexOf("export async function oversight"), service.indexOf("export async function", service.indexOf("export async function oversight") + 10));

test("SKAI-1441: oversight logs are filtered to actors on the lead's campus", () => {
  assert.match(oversight, /prisma\.user\.findMany\(\{ where: \{ schoolId: user\.schoolId, campusId: m\.campusId \}/);
  assert.match(oversight, /prisma\.confidentialAccessLog\.findMany\(\{ where: \{ schoolId: user\.schoolId, domain, actorId: \{ in: campusStaff\.map/);
  assert.doesNotMatch(oversight, /confidentialAccessLog\.findMany\(\{ where: \{ schoolId: user\.schoolId, domain \}/);
});

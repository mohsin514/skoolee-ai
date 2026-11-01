import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1440: only an active campus leader can be a pickup lead or decide a release exception.
const service = readFileSync("src/lib/pickup/service.ts", "utf8");
const decide = service.slice(service.indexOf("export async function decideException"), service.indexOf("export async function gateQueue"));
const add = service.slice(service.indexOf("export async function addRestriction"), service.indexOf("export async function liftRestriction"));

test("SKAI-1440: deciding an exception revalidates an active campus leader on the same campus", () => {
  assert.match(decide, /tx\.user\.findFirst\(\{ where: \{ id: user\.userId, schoolId: user\.schoolId, isActive: true \}/);
  assert.match(decide, /!actor \|\| !\(isLead\(user\) && sameCampus\(user, check\.campusId\)\)/);
  assert.doesNotMatch(decide, /restriction\?\.leadUserId !== user\.userId/);
});

test("SKAI-1440: a designated lead must be an active CAMPUS_ADMIN or ADMIN on the pupil's campus", () => {
  assert.match(add, /tx\.user\.findFirst\(\{ where: \{ id: leadUserId, schoolId: user\.schoolId, campusId: student\.campusId, isActive: true, role: \{ in: \["CAMPUS_ADMIN", "ADMIN"\] \} \}/);
  assert.match(add, /leadUserId,\s*endsAt/);
});

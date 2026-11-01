import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1454: a section transfer must stay inside the caller's school, including for SUPER_ADMIN.
const route = readFileSync("src/app/api/classes/transfer/route.ts", "utf8");

test("SKAI-1454: source and target sections are looked up by the caller's school", () => {
  assert.match(route, /async function plan\(schoolId: string,/);
  assert.match(route, /where: \{ id: fromClassId, schoolId, \.\.\./);
  assert.match(route, /where: \{ id: toClassId, schoolId, \.\.\./);
  assert.match(route, /await plan\(user\.schoolId, /);
});

test("SKAI-1454: the transaction re-verifies school ownership before any write", () => {
  const tx = route.slice(route.indexOf("prisma.$transaction"));
  assert.match(tx, /findFirst\(\{ where: \{ id: preview\.from\.id, schoolId: user\.schoolId \}/);
  assert.match(tx, /findFirstOrThrow\(\{ where: \{ id: preview\.from\.id, schoolId: user\.schoolId \}/);
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1993: the tenant extension adds schoolId to every create, and the access-version input nested under
// guardianRelationship.create has no schoolId, so admitting with a guardian answered 500. The version is
// created at top level, as the guardians route does.
test("SKAI-1993: admission creates the pending guardian access version at top level", () => {
  const src = readFileSync("src/lib/students/create.ts", "utf8");
  const start = src.indexOf("tx.guardianRelationship.create(");
  assert.ok(start > 0, "guardian relationship create not found");
  const relationCreate = src.slice(start, src.indexOf("tx.guardianAccessVersion.create(", start));
  assert.doesNotMatch(relationCreate, /accessVersions:\s*\{\s*create/);
  assert.match(src, /tx\.guardianAccessVersion\.create\(\{ data: \{\s*id: randomUUID\(\), schoolId: user\.schoolId, relationshipId: relationId/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SKAI-1807 (DB-01 Phase 1a): every model that stores a schoolId must declare the School relation, so the
// database holds a real foreign key and an empty or unknown school can never be written. A composite relation
// that includes schoolId (a child pinned to its parent's (id, schoolId)) also counts: the parent is checked here too.
test("every model with a schoolId has a foreign key that includes it", () => {
  const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
  const missing: string[] = [];
  for (const [, name, body] of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    if (!/^\s*schoolId\s+String/m.test(body)) continue;
    if (!/@relation\([^)]*fields:\s*\[[^\]]*\bschoolId\b/.test(body)) missing.push(name);
  }
  assert.deepEqual(missing, [], `add \`school School @relation(fields: [schoolId], references: [id], onDelete: Cascade)\` to: ${missing.join(", ")}`);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/curriculum/service.ts", "utf8");

test("SKAI-1738: every approved curriculum on the campus is offered as a mapping target", () => {
  const line = src.split("\n").find(row => row.includes("const others = isSchoolAiManager(user)")) ?? "";
  assert.ok(line, "mapping-target query present");
  assert.doesNotMatch(line, /take:/);
  assert.match(line, /where: \{ schoolId: user\.schoolId, campusId, kind: "CURRICULUM", status: "APPROVED", id: \{ not: record\.id \} \}/, "school + campus scoped, approved only");
  assert.match(line, /orderBy: \[\{ title: "asc" \}, \{ id: "asc" \}\]/, "stable order");
  assert.match(line, /^\s*const others = isSchoolAiManager\(user\) \? await tx\.schoolAiRecord\.findMany\(.*\) : \[\];/, "non-managers still get no targets");
});

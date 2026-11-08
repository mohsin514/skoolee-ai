import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/curriculum/service.ts", "utf8");

test("SKAI-1735: version comparison lists every revision of the curriculum, not the newest 50", () => {
  const line = src.split("\n").find(row => row.includes("const versions = await tx.schoolAiRevision.findMany(")) ?? "";
  assert.ok(line, "versions query present");
  assert.doesNotMatch(line, /take:/);
  assert.match(line, /where: \{ schoolId: user\.schoolId, recordId: record\.id \}/, "still scoped to the opened (authorised) record");
  assert.match(line, /select: \{ version: true, status: true, createdAt: true \}/, "metadata only");
  assert.match(src.slice(src.indexOf("export async function objectiveMap")), /const \{ record, curriculum \} = await openCurriculum\(tx, user, input\.recordId\);/);
});

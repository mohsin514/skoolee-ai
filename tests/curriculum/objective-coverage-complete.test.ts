import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/curriculum/service.ts", "utf8");
const body = src.slice(src.indexOf("export async function objectiveMap"));
const query = (marker: string) => body.split("\n").find(row => row.includes(marker)) ?? "";

test("SKAI-1739: coverage, impact and export read every scoped paper, release and resource", () => {
  const papers = query("const paperRows = await tx.schoolAiRecord.findMany(");
  const releases = query("const releaseRows = await tx.schoolAiExamAssignment.findMany(");
  const resources = query("const resourceRows = await tx.learningResource.findMany(");
  for (const [name, line] of [["papers", papers], ["releases", releases], ["resources", resources]] as const) {
    assert.ok(line, `${name} query present`);
    assert.doesNotMatch(line, /take:/, `${name} are not capped`);
  }
  assert.match(papers, /where: \{ schoolId: user\.schoolId, campusId, kind: "PAPER", subjectId: curriculum\.subjectId, classId: curriculum\.classId, \.\.\.\(isSchoolAiManager\(user\) \? \{\} : \{ createdById: user\.userId \}\) \}/);
  assert.match(releases, /where: \{ schoolId: user\.schoolId, campusId, classId: curriculum\.classId, status: \{ not: "DRAFT" \}/);
  assert.match(resources, /where: \{ schoolId: user\.schoolId, classId: curriculum\.classId \}/);
});

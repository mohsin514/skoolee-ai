import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("SKAI-242 editing an exam's term validates it against the academic model and re-links the version", () => {
  const src = readFileSync("src/app/api/exams/route.ts", "utf8");
  const body = src.slice(src.indexOf("async function editExamDetails"), src.indexOf("export async function GET"));
  assert.match(body, /resolveAcademicModelVersionForTerm\(\{ campusId: current\.campusId, classId: current\.classId, academicYear: current\.academicYear, term: diff\.after\.term \}, tx\)/);
  assert.match(body, /data: \{ \.\.\.diff\.after, \.\.\.termLink \}/);
});

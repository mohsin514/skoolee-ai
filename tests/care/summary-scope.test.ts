import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2185: care summaries reach the pupil's teachers, academic leaders and care members; office roles are denied.
test("careSummary is limited to teachers of the pupil, leaders and care members", () => {
  const source = readFileSync("src/lib/care/service.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function careSummary"), source.indexOf("// ─── Safeguarding"));
  assert.match(source, /const summaryReader = \(user: AuthUser\) => user\.role === "TEACHER" \|\| canManageAcademics\(user\)/);
  assert.match(fn, /!summaryReader\(user\) && !\(await membership\(user, "CLINIC"\)\) && !\(await membership\(user, "SAFEGUARDING"\)\)\) return deny/);
  assert.match(fn, /user\.role === "TEACHER" && !\(student\.classId && \(await teacherClassIds\(user\.userId\)\)\.includes\(student\.classId\)\)/);
  const desk = readFileSync("src/components/care/care.tsx", "utf8");
  assert.match(desk, /me\.canReadSummaries \? \[\{ id: "summary"/);
});

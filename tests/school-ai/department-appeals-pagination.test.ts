import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APPEAL_PAGE, appealNextCursor, appealPageWhere } from "@/lib/school-ai/exam-results";
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";

test("SKAI-1725: the 51st department appeal is reachable by cursor, ties included", () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: `a${String(i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 9, 1) + Math.floor(i / 2) * 1000) }));
  const where = appealPageWhere(appealNextCursor(rows)) as { OR: [{ createdAt: { gt: Date } }, { createdAt: Date; id: { gt: string } }] };
  const rest = rows.filter(r => r.createdAt > where.OR[0].createdAt.gt || (r.createdAt.getTime() === where.OR[1].createdAt.getTime() && r.id > where.OR[1].id.gt));
  assert.deepEqual(rest.map(r => r.id), [rows[50].id]);
  assert.equal(appealNextCursor(rows.slice(0, APPEAL_PAGE)), null);
  assert.throws(() => appealPageWhere("Zm9v"), /changed/);
});

test("SKAI-1725: every page keeps the school, campus, department and released-result filters", () => {
  const src = readFileSync("src/lib/school-ai/exam-results.ts", "utf8");
  const body = src.slice(src.indexOf("export async function listDepartmentAppeals"), src.indexOf("export async function regradeExamAttempt"));
  assert.match(body, /if \(user\.role !== "TEACHER"\) return none;/);
  assert.match(body, /where: \{ schoolId: user\.schoolId, campusId: user\.campusId \?\? "", status: \{ in: \["OPEN", "UPHELD"\] \}, attempt: \{ assignment: \{ resultsReleasedAt: \{ not: null \}/);
  assert.match(body, /\} \}, \.\.\.appealPageWhere\(cursor\) \}, orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\], take: APPEAL_PAGE \+ 1/);
  assert.match(body, /for \(const row of rows\) await departmentResultScope\(user, row\.assignmentId, row\.attemptId, tx\);/);
  assert.match(readFileSync("src/components/school-ai/exam-studio/department-appeals.tsx", "utf8"), /data-department-appeals-more/);
  for (const lang of ["en", "ar", "ur"] as const) { const t = studioResultsCopy(lang); assert.ok(t.departmentLoadMore && t.departmentLoadingMore && t.departmentMoreFailed, lang); }
});

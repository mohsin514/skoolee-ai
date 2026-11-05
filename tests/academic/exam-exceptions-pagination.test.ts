import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RESOLVED_EXCEPTION_PAGE, resolvedExceptionCursor, resolvedExceptionWhere } from "@/lib/academic/exam-office-service";
import { studioOfficeCopy } from "@/lib/school-ai/exam-studio-copy-office";

test("SKAI-1717: 301 resolved exceptions return a cursor that reaches the 301st, ties included", () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ id: `e${String(999 - i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 5, 1) - Math.floor(i / 3) * 1000) }));
  const where = resolvedExceptionWhere(resolvedExceptionCursor(rows)) as { OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] };
  const rest = rows.filter(r => r.createdAt < where.OR[0].createdAt.lt || (r.createdAt.getTime() === where.OR[1].createdAt.getTime() && r.id < where.OR[1].id.lt));
  assert.deepEqual(rest.map(r => r.id), [rows[300].id]);
  assert.equal(resolvedExceptionCursor(rows.slice(0, RESOLVED_EXCEPTION_PAGE)), null);
  assert.throws(() => resolvedExceptionWhere("Zm9v"), /changed/);
});

test("SKAI-1717: open exceptions are never capped; every page keeps school, campus and session scope", () => {
  const service = readFileSync("src/lib/academic/exam-office-service.ts", "utf8");
  const body = service.slice(service.indexOf("export async function listExceptions"), service.indexOf("export async function createException"));
  assert.doesNotMatch(body, /take: 300\b/);
  assert.match(body, /const session = await sessionFor\(user, sessionId\);/);
  assert.match(body, /where: \{ schoolId: user\.schoolId, campusId: session\.campusId, sessionId \}/);
  assert.match(body, /where: \{ \.\.\.inSession, status: "OPEN" \}, orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\] \}\)/);
  assert.match(body, /cursor \? \[\] :/, "later pages carry only resolved history");
  assert.match(readFileSync("src/components/academic/exams/ExceptionsDesk.tsx", "utf8"), /data-exceptions-more/);
  for (const language of ["en", "ar", "ur"] as const) { const t = studioOfficeCopy(language); assert.ok(t.exceptionsLoadMore && t.exceptionsLoadingMore && t.exceptionsMoreFailed, language); }
});

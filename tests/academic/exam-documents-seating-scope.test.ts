import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * SKAI-279 (QA lane e): a principal of another school requested the qa-alpha session seating plan and got a
 * 200 PDF. The seating branch must resolve the session and exam inside the caller's campus before rendering,
 * so another school's (or a missing) session is denied with 404 and no roster is produced.
 *
 * Static guard: the route source must keep the campus-scoped lookups ahead of renderSeatingPdf, and the
 * seating branch must stay limited to the examination office and teachers.
 */
const source = readFileSync("src/app/api/academic/exam-documents/route.ts", "utf8");
const seating = source.slice(source.indexOf('if (doc === "seating")'), source.indexOf('if (doc !== "datesheet")'));

test("seating branch denies a session outside the caller's campus before rendering", () => {
  const guard = seating.indexOf("examSession.findFirst({ where: { id: sessionId, campusId }");
  const render = seating.indexOf("renderSeatingPdf({");
  assert.ok(guard > 0, "session lookup must be scoped to campusId");
  assert.ok(guard < render, "session guard must run before renderSeatingPdf");
  assert.match(seating, /Exam session not found", 404/);
});

test("seating branch denies an exam outside the caller's campus before rendering", () => {
  const guard = seating.indexOf("exam.findFirst({ where: { id: examId, campusId }");
  const render = seating.indexOf("renderSeatingPdf({");
  assert.ok(guard > 0, "exam lookup must be scoped to campusId");
  assert.ok(guard < render, "exam guard must run before renderSeatingPdf");
  assert.match(seating, /Exam not found", 404/);
});

test("seating stays limited to the examination office and teachers", () => {
  assert.match(seating, /if \(!canManageOperations\(user\) && user\.role !== "TEACHER"\) throw new ApiError\([^)]*, 403\)/);
});

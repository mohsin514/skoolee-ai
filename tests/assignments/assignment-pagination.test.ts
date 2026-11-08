import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASSIGNMENT_PAGE_SIZE, assignmentPage, assignmentPageWhere, listInput } from "@/lib/assignments/service";
import { getAssignmentCopy } from "@/components/assignments/assignment-copy";

const rows = Array.from({ length: 201 }, (_, i) => ({ id: `a${String(1000 - i).padStart(4, "0")}`, updatedAt: new Date(Date.UTC(2026, 0, 1) - Math.floor(i / 2) * 1000) }));

test("SKAI-1699: 201 assignments return a full page plus a cursor to row 201", () => {
  const { page, nextCursor } = assignmentPage(rows);
  assert.equal(page.length, ASSIGNMENT_PAGE_SIZE);
  assert.ok(nextCursor);
  const where = assignmentPageWhere(nextCursor!) as { OR: [{ updatedAt: { lt: Date } }, { updatedAt: Date; id: { lt: string } }] };
  const last = page[page.length - 1];
  assert.equal(where.OR[0].updatedAt.lt.getTime(), last.updatedAt.getTime());
  assert.equal(where.OR[1].id.lt, last.id);
  // the keyset filter keeps exactly the rows after the last one shown, including a same-timestamp tie
  const rest = rows.filter(r => r.updatedAt < where.OR[0].updatedAt.lt || (r.updatedAt.getTime() === where.OR[1].updatedAt.getTime() && r.id < where.OR[1].id.lt));
  assert.deepEqual(rest.map(r => r.id), [rows[200].id]);
});

test("SKAI-1699: the last page has no cursor; a forged cursor is refused", () => {
  assert.equal(assignmentPage(rows.slice(0, 200)).nextCursor, null);
  assert.deepEqual(assignmentPageWhere(undefined), {});
  assert.throws(() => assignmentPageWhere("bm9wZQ"), /expired/);
  assert.equal(listInput.parse({ classId: "c1", cursor: "x" }).cursor, "x");
});

test("SKAI-1699: staff, learner and guardian lists page through the same scoped query", () => {
  const service = readFileSync("src/lib/assignments/service.ts", "utf8");
  assert.doesNotMatch(service.slice(service.indexOf("export async function listAssignments"), service.indexOf("export async function getAssignment")), /take: 200/);
  assert.match(service, /schoolId: user\.schoolId, status: \{ not: "DRAFT" \}, AND: \[\{ OR: \[\{ classId: \{ in: students/);
  assert.match(service, /schoolId: user\.schoolId, classId, \.\.\.assignmentPageWhere\(input\.cursor\)/);
  for (const file of ["LearnerAssignments", "AssignmentWorkspace"]) assert.match(readFileSync(`src/components/assignments/${file}.tsx`, "utf8"), /<LoadOlder cursor=/);
  for (const language of ["en", "ar", "ur"]) { const t = getAssignmentCopy(language); assert.ok(t.loadOlder && t.loadingOlder && t.olderFailed, language); }
});

import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { auditedOperation, resetAuditTrailState } from "../../src/lib/db/audit-trail";
import { getTenantContext, runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1692: one support-note append writes exactly one audit row (the audit-trail extension's), never two.
type Row = Record<string, any>;
const audits: Row[] = [];
const notes: Row[] = [];
const teachers = [
  { id: "t-a", schoolId: "school-a", campusId: "campus-a", role: "TEACHER" },
  { id: "t-b", schoolId: "school-b", campusId: "campus-b", role: "TEACHER" },
];
const base: Row = {
  auditLog: { create: async ({ data }: Row) => { // The tenant guard stamps schoolId from the context the extension writes under.
    const row = { id: `audit-${audits.length + 1}`, schoolId: getTenantContext()?.schoolId, ...data }; audits.push(row); return row; } },
  teacherSupportNote: { create: async ({ data }: Row) => { const row = { id: `note-${notes.length + 1}`, ...data }; notes.push(row); return row; } },
};
// Route every write through the real audit-trail extension, as the guarded client does.
const audited = (delegate: string, operation: string) => (args: unknown) =>
  auditedOperation({ delegate, operation, args, query: base[delegate][operation], client: base as never });
const prisma = {
  user: { findFirst: async ({ where }: Row) => teachers.find(t => t.id === where.id && t.campusId === where.campusId && t.role === where.role) ?? null },
  teacherSupportNote: { create: audited("teacherSupportNote", "create") },
  auditLog: { create: audited("auditLog", "create") },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
};
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    canManageOperations: (u: Row) => u.role === "PRINCIPAL",
    canLeadAcademics: async (u: Row) => u.role === "PRINCIPAL",
  },
});
const addNote = async (...args: Parameters<typeof import("../../src/lib/staff/teaching-evidence").addNote>) => (await import("../../src/lib/staff/teaching-evidence")).addNote(...args);

const leaderA = { userId: "p-a", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
const leaderB = { userId: "p-b", role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b" };
const as = <T>(u: Row, fn: () => Promise<T>) => runWithTenantContext({ schoolId: u.schoolId, userId: u.userId }, fn);
const text = "Agreed a peer observation of a synthetic lesson next week.";

beforeEach(() => { audits.length = 0; notes.length = 0; resetAuditTrailState(); });

test("one append writes exactly one audit row with actor, school and the note", async () => {
  const note = await as(leaderA, () => addNote(leaderA as never, "campus-a", "t-a", 2026, text));
  assert.equal(note.kind, "SUPPORT_ACTION");
  assert.equal(audits.length, 1);
  const [row] = audits;
  assert.equal(row.tableName, "teacher_support_notes");
  assert.equal(row.recordId, note.id);
  assert.equal(row.userId, "p-a");
  assert.equal(row.schoolId, "school-a");
  assert.equal(row.oldValue, undefined);
  assert.deepEqual(
    { operation: row.newValue.operation, teacherId: row.newValue.teacherId, academicYear: row.newValue.academicYear, kind: row.newValue.kind, authorId: row.newValue.authorId },
    { operation: "create", teacherId: "t-a", academicYear: 2026, kind: "SUPPORT_ACTION", authorId: "p-a" },
  );
});

test("two schools stay isolated: each append is filed under its own school only", async () => {
  await as(leaderA, () => addNote(leaderA as never, "campus-a", "t-a", 2026, text));
  await as(leaderB, () => addNote(leaderB as never, "campus-b", "t-b", 2026, text));
  assert.deepEqual(audits.map(a => [a.schoolId, a.userId]), [["school-a", "p-a"], ["school-b", "p-b"]]);
  await assert.rejects(as(leaderB, () => addNote(leaderB as never, "campus-b", "t-a", 2026, text)), (e: ApiError) => e.status === 404);
  assert.equal(audits.length, 2);
});

test("a denied role is refused and writes no audit row", async () => {
  const parent = { userId: "g-a", role: "PARENT", schoolId: "school-a", campusId: "campus-a" };
  await assert.rejects(as(parent, () => addNote(parent as never, "campus-a", "t-a", 2026, text)), (e: ApiError) => e.status === 403);
  const otherTeacher = { userId: "t-x", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  await assert.rejects(as(otherTeacher, () => addNote(otherTeacher as never, "campus-a", "t-a", 2026, text)), (e: ApiError) => e.status === 403);
  assert.equal(audits.length, 0);
  assert.equal(notes.length, 0);
});

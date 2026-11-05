import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1682: a family's meeting history pages past the newest 20 with a cursor; every page keeps school,
// child and guardian scope, and older rows keep their shared follow-up and agreed actions.
type Row = { id: string; schoolId: string; campusId: string; studentId: string; teacherId: string; guardianUserId: string; status: string; startsAt: Date; endsAt: Date };
const rows: Row[] = [];
const add = (school: string, campus: string, student: string, n: number) => {
  for (let i = 0; i < n; i++) rows.push({ id: `${student}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, studentId: student, teacherId: "t1", guardianUserId: `g-${student}`, status: "HELD", startsAt: new Date(Date.UTC(2026, 0, 1 + i, 9)), endsAt: new Date(Date.UTC(2026, 0, 1 + i, 10)) });
};
add("school-a", "campus-a1", "s-a", 23); // 23 bookings: one page of 20, then 3 older
add("school-a", "campus-a2", "s-a2", 2); // same school, other campus, other child
add("school-b", "campus-b1", "s-b", 5); // other school

type Find = { where: { schoolId: string; studentId: string }; orderBy: unknown; take: number; skip?: number; cursor?: { id: string } };
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => rows.some(r => r.studentId === where.id && r.schoolId === where.schoolId) ? { id: where.id, campusId: null, classId: null, fullName: "Synthetic Pupil", class: null } : null },
  meetingWindow: { findMany: async () => [] },
  meetingBooking: {
    findMany: async ({ where, take, skip = 0, cursor }: Find) => {
      const scoped = rows.filter(r => r.schoolId === where.schoolId && r.studentId === where.studentId).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? scoped.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return scoped.slice(start + skip, start + skip + take).map(r => ({ ...r, conflictReason: null, version: 1, mode: "IN_PERSON", agenda: null, accessNeeds: null, window: { location: "Room 1", timezone: "UTC", cancellationPolicy: "" }, events: [], followUp: { summary: `Summary ${r.id}`, sharedAt: new Date(0) }, actions: [{ id: `act-${r.id}`, text: "Read together", ownerRole: "FAMILY", dueDate: "2026-02-01", status: "OPEN", completedAt: null }] }));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ studentId, guardianUserId }: { studentId: string; guardianUserId: string }) => guardianUserId === `g-${studentId}` || guardianUserId === `g2-${studentId}` ? { id: "rel" } : null } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });

const guardian = (school: string, id: string, role = "PARENT") => ({ userId: id, schoolId: school, campusId: null, role }) as never;

test("the first page holds the newest 20 and a cursor reaches every older booking with its follow-up", async () => {
  const { familyMeetings, familyMeetingHistory } = await import("../../src/lib/meetings/service");
  const first = await familyMeetings(guardian("school-a", "g-s-a"), "s-a");
  assert.equal(first.bookings.length, 20);
  assert.equal(first.bookings[0].id, "s-a-22");
  assert.ok(first.nextCursor);
  const older = await familyMeetingHistory(guardian("school-a", "g-s-a"), "s-a", first.nextCursor!);
  assert.deepEqual(older.bookings.map(b => b.id), ["s-a-02", "s-a-01", "s-a-00"]);
  assert.equal(older.nextCursor, null);
  assert.equal(older.bookings[2].followUp?.summary, "Summary s-a-00");
  assert.equal(older.bookings[2].actions.length, 1);
  const ids = new Set([...first.bookings, ...older.bookings].map(b => b.id));
  assert.equal(ids.size, 23);
});

test("a second guardian of the same child sees the same full history; a refresh starts again at the newest", async () => {
  const { familyMeetings, familyMeetingHistory } = await import("../../src/lib/meetings/service");
  const again = await familyMeetings(guardian("school-a", "g2-s-a"), "s-a");
  assert.equal(again.bookings[0].id, "s-a-22");
  const older = await familyMeetingHistory(guardian("school-a", "g2-s-a"), "s-a", again.nextCursor!);
  assert.equal(older.bookings.length, 3);
  assert.ok(older.bookings.every(b => !b.mine));
});

test("pages never cross school, campus or child, and other roles or unlinked guardians are denied", async () => {
  const { familyMeetings, familyMeetingHistory } = await import("../../src/lib/meetings/service");
  const small = await familyMeetings(guardian("school-a", "g-s-a2"), "s-a2");
  assert.deepEqual(small.bookings.map(b => b.id), ["s-a2-01", "s-a2-00"]);
  assert.equal(small.nextCursor, null);
  // A cursor from another child's history yields nothing for this child.
  assert.deepEqual((await familyMeetingHistory(guardian("school-a", "g-s-a2"), "s-a2", "s-a-05")).bookings, []);
  // School B's guardian cannot open school A's child, even with a valid cursor.
  await assert.rejects(familyMeetingHistory(guardian("school-b", "g-s-b"), "s-a", "s-a-05"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(familyMeetingHistory(guardian("school-a", "g-s-b"), "s-a", "s-a-05"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(familyMeetingHistory(guardian("school-a", "t1", "TEACHER"), "s-a", "s-a-05"), (e: { status?: number }) => e.status === 403);
});

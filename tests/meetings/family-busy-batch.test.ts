import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1872: the family meeting page reads every teacher's lessons and leave in one query pair (not one
// round trip per teacher) and skips leave that ended before today. Open slots, school scope and denials
// are unchanged.
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const meetDay = iso(Date.now() + 3 * DAY), weekday = new Date(`${meetDay}T00:00:00Z`).getUTCDay() || 7; // ISO weekday, as timetables store it
const window = (id: string, teacherId: string) => ({ id, schoolId: "school-a", teacherId, status: "OPEN", localDate: meetDay, startTime: "09:00", endTime: "10:00", slotMinutes: 30, bufferMinutes: 0, maxBookings: null, timezone: "UTC", mode: "IN_PERSON", location: "Room 1", cancellationPolicy: null });
const teachers = ["t1", "t2", "t3", "t4"];
const windows = teachers.map(t => window(`w-${t}`, t));
const slots = [
  { schoolId: "school-a", teacherId: "t1", slotType: "CLASS", dayOfWeek: weekday, startTime: "09:00", endTime: "09:30" },
  { schoolId: "school-b", teacherId: "t3", slotType: "CLASS", dayOfWeek: weekday, startTime: "09:00", endTime: "10:00" },
];
const leaves = [
  { schoolId: "school-a", userId: "t2", status: "APPROVED", fromDate: new Date(`${iso(Date.now() - DAY)}T00:00:00Z`), toDate: new Date(`${iso(Date.now() + 5 * DAY)}T00:00:00Z`) },
  // Many years of old leave for t4: none of it can block a future slot, and none of it is read.
  ...Array.from({ length: 50 }, (_, i) => ({ schoolId: "school-a", userId: "t4", status: "APPROVED", fromDate: new Date(Date.now() - (400 + i) * DAY), toDate: new Date(Date.now() - (399 + i) * DAY) })),
  { schoolId: "school-b", userId: "t4", status: "APPROVED", fromDate: new Date(Date.now() - DAY), toDate: new Date(Date.now() + 9 * DAY) },
];

let slotQueries = 0, leaveQueries = 0, leaveRows = 0;
type In = { in: string[] };
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => where.id === "kid" && where.schoolId === "school-a" ? { id: "kid", campusId: "campus-a", classId: "class-a", fullName: "Synthetic Pupil", class: { classTeacherId: "t1" } } : null },
  subject: { findMany: async () => ["t2", "t3", "t4"].map(t => ({ name: `Subject ${t}`, teacherId: t })) },
  user: { findMany: async ({ where }: { where: { id: In } }) => where.id.in.map(id => ({ id, fullName: `Teacher ${id}` })) },
  meetingWindow: { findMany: async ({ where }: { where: { schoolId: string; teacherId: In } }) => windows.filter(w => w.schoolId === where.schoolId && where.teacherId.in.includes(w.teacherId)) },
  meetingBooking: { findMany: async () => [] },
  timetableSlot: {
    findMany: async ({ where }: { where: { schoolId: string; teacherId: In; slotType: string; timetable: { status: string } } }) => {
      slotQueries++;
      assert.equal(where.timetable.status, "PUBLISHED");
      return slots.filter(s => s.schoolId === where.schoolId && where.teacherId.in.includes(s.teacherId) && s.slotType === where.slotType);
    },
  },
  leaveRequest: {
    findMany: async ({ where }: { where: { schoolId: string; userId: In; status: string; toDate?: { gte: Date } } }) => {
      leaveQueries++;
      const rows = leaves.filter(l => l.schoolId === where.schoolId && where.userId.in.includes(l.userId) && l.status === where.status && (!where.toDate || l.toDate >= where.toDate.gte));
      leaveRows += rows.length;
      return rows;
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ schoolId, guardianUserId }: { schoolId: string; guardianUserId: string }) => schoolId === "school-a" && guardianUserId === "mum" ? { id: "rel" } : null } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });

const user = (schoolId: string, userId: string, role = "PARENT") => ({ userId, schoolId, campusId: null, role }) as never;
const svc = () => import("../../src/lib/meetings/service");

test("SKAI-1872: one lessons query and one leave query for all teachers, with unchanged open slots", async () => {
  slotQueries = 0; leaveQueries = 0; leaveRows = 0;
  const desk = await (await svc()).familyMeetings(user("school-a", "mum"), "kid");
  assert.equal(slotQueries, 1);
  assert.equal(leaveQueries, 1);
  assert.equal(leaveRows, 1, "only t2's current leave; t4's past leave and school B's leave are not read");
  const open = new Map(desk.windows.map(w => [w.teacherId, w.slots.map(s => s.start)]));
  assert.deepEqual(open.get("t1"), ["09:30"], "t1 teaches 09:00-09:30");
  assert.equal(open.has("t2"), false, "t2 is on approved leave that day");
  assert.deepEqual(open.get("t3"), ["09:00", "09:30"], "school B's timetable never blocks a school A teacher");
  assert.deepEqual(open.get("t4"), ["09:00", "09:30"], "old leave and school B's leave never block");
});

test("SKAI-1872: other roles and guardians of another school are denied before any busy lookup", async () => {
  slotQueries = 0; leaveQueries = 0;
  const { familyMeetings } = await svc();
  await assert.rejects(familyMeetings(user("school-a", "t1", "TEACHER"), "kid"), (e: { status?: number }) => e.status === 403);
  await assert.rejects(familyMeetings(user("school-b", "mum"), "kid"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(familyMeetings(user("school-a", "stranger"), "kid"), (e: { status?: number }) => e.status === 404);
  assert.equal(slotQueries + leaveQueries, 0);
});

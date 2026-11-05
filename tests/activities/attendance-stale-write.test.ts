import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1710: an attendance save carries the mark the editor saw; a stale save gets 409 and keeps the newer mark.
type Mark = { id: string; schoolId: string; sessionId: string; studentId: string; status: string; markedById: string; markedAt: Date };
const marks: Mark[] = [];
const activities = [
  { id: "act-a", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "coord-a", staffIds: ["coord-a2"] },
  { id: "act-b", schoolId: "school-b", campusId: "campus-b1", coordinatorId: "coord-b", staffIds: [] as string[] },
];
const sessions = [{ id: "ses-a", schoolId: "school-a", activityId: "act-a" }, { id: "ses-b", schoolId: "school-b", activityId: "act-b" }];
let tick = 1_000;
const match = (m: Mark, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => v instanceof Date ? (m as never as Record<string, Date>)[k]?.getTime() === v.getTime() : (m as never as Record<string, unknown>)[k] === v);
const prisma = {
  activitySession: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { const s = sessions.find(x => x.id === where.id && x.schoolId === where.schoolId); return s ? { ...s, activity: activities.find(a => a.id === s.activityId) } : null; } },
  activityPlace: { count: async () => 1 },
  activityAttendance: {
    create: async ({ data }: { data: Omit<Mark, "id" | "markedAt"> }) => { if (marks.some(m => m.sessionId === data.sessionId && m.studentId === data.studentId)) throw Object.assign(new Error("dup"), { code: "P2002" }); const row = { id: `m${marks.length + 1}`, ...data, markedAt: new Date(tick++) }; marks.push(row); return row; },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Mark> }) => { const hit = marks.filter(m => match(m, where)); hit.forEach(m => Object.assign(m, data, { markedAt: new Date(tick++) })); return { count: hit.length }; },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => marks.find(m => match(m, where)) ?? null,
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const user = (id: string, school: "a" | "b") => ({ userId: id, schoolId: `school-${school}`, campusId: `campus-${school}1`, role: "TEACHER" }) as never;
const conflict = (e: { status?: number }) => e.status === 409;

test("a fresh mark and a current-version update both succeed", async () => {
  const { markAttendance } = await import("../../src/lib/activities/service");
  marks.length = 0;
  await markAttendance(user("coord-a", "a"), { sessionId: "ses-a", studentId: "st1", status: "PRESENT", expectedMarkedAt: null });
  await markAttendance(user("coord-a", "a"), { sessionId: "ses-a", studentId: "st1", status: "ABSENT", expectedMarkedAt: marks[0].markedAt.toISOString() });
  assert.equal(marks[0].status, "ABSENT");
});

test("a stale second editor gets 409 and the newer mark is kept", async () => {
  const { markAttendance } = await import("../../src/lib/activities/service");
  marks.length = 0;
  await markAttendance(user("coord-a", "a"), { sessionId: "ses-a", studentId: "st1", status: "PRESENT", expectedMarkedAt: null });
  await assert.rejects(markAttendance(user("coord-a2", "a"), { sessionId: "ses-a", studentId: "st1", status: "ABSENT", expectedMarkedAt: null }), conflict);
  const seen = marks[0].markedAt.toISOString();
  await markAttendance(user("coord-a", "a"), { sessionId: "ses-a", studentId: "st1", status: "LATE_WITHDRAWAL", expectedMarkedAt: seen });
  await assert.rejects(markAttendance(user("coord-a2", "a"), { sessionId: "ses-a", studentId: "st1", status: "ABSENT", expectedMarkedAt: seen }), conflict);
  await assert.rejects(markAttendance(user("coord-a2", "a"), { sessionId: "ses-a", studentId: "st1", status: "ABSENT" }), conflict);
  assert.equal(marks[0].status, "LATE_WITHDRAWAL");
  assert.equal(marks[0].markedById, "coord-a");
});

test("each school's marks stay separate and another school cannot reach the session", async () => {
  const { markAttendance } = await import("../../src/lib/activities/service");
  marks.length = 0;
  await markAttendance(user("coord-a", "a"), { sessionId: "ses-a", studentId: "st1", status: "PRESENT", expectedMarkedAt: null });
  await markAttendance(user("coord-b", "b"), { sessionId: "ses-b", studentId: "st1", status: "ABSENT", expectedMarkedAt: null });
  assert.deepEqual(marks.map(m => [m.schoolId, m.status]), [["school-a", "PRESENT"], ["school-b", "ABSENT"]]);
  await assert.rejects(markAttendance(user("coord-b", "b"), { sessionId: "ses-a", studentId: "st1", status: "ABSENT", expectedMarkedAt: marks[0].markedAt.toISOString() }), (e: { status?: number }) => e.status === 404);
  assert.equal(marks[0].status, "PRESENT");
});

test("a teacher who does not run the activity is refused and nothing changes", async () => {
  const { markAttendance } = await import("../../src/lib/activities/service");
  marks.length = 0;
  await assert.rejects(markAttendance(user("t-other", "a"), { sessionId: "ses-a", studentId: "st1", status: "PRESENT", expectedMarkedAt: null }), (e: { status?: number }) => e.status === 404);
  assert.equal(marks.length, 0);
});

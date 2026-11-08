import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-743: a caller without register access gets no server record back, and a replay is not counted as accepted again.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
class PrismaClientKnownRequestError extends Error { code = ""; }
type Row = Record<string, unknown> & { schoolId: string; operationId: string };
const ops: Row[] = [];
const attendance = [
  { id: "att-a", schoolId: "school-a", studentId: "pupil-a", status: "ABSENT", arrivalTime: null, version: 3, markedAt: new Date(), marker: { fullName: "Teacher A" } },
  { id: "att-b", schoolId: "school-b", studentId: "pupil-b", status: "PRESENT", arrivalTime: null, version: 2, markedAt: new Date(), marker: { fullName: "Teacher B" } },
];
let saved = 0;
mock.module("@prisma/client", { namedExports: { Prisma: { PrismaClientKnownRequestError } } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  offlineOperation: {
    findFirst: async ({ where }: { where: Row }) => ops.find(o => o.schoolId === where.schoolId && o.operationId === where.operationId) ?? null,
    create: async ({ data }: { data: Row }) => { ops.push(data); return data; },
  },
  attendance: { findFirst: async ({ where }: { where: { schoolId: string; studentId: string } }) => attendance.find(a => a.schoolId === where.schoolId && a.studentId === where.studentId) ?? null },
} } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, canManageOperations: () => false } });
mock.module("@/lib/datetime", { namedExports: { getSchoolTimeZone: async () => "UTC", calendarDateIn: () => "2026-11-08", schoolToday: async () => "2026-11-08" } });
const classes: Record<string, { school: string; pupils: string[] }> = { "class-a": { school: "school-a", pupils: ["pupil-a"] }, "class-b": { school: "school-b", pupils: ["pupil-b"] } };
mock.module("@/lib/attendance/register", { namedExports: {
  registerView: async (user: { role: string; schoolId: string }, classId: string) => {
    if (user.role !== "TEACHER") throw new ApiError("You cannot view attendance registers.", 403);
    const cls = classes[classId];
    if (!cls || cls.school !== user.schoolId) throw new ApiError("You are not assigned to register this class.", 404);
    return { entries: cls.pupils.map(studentId => ({ studentId })) };
  },
  saveRegister: async () => { saved++; return { conflicts: [] }; },
} });
const user = (role: string, school: "a" | "b") => ({ userId: `${role}-${school}`, role, schoolId: `school-${school}`, campusId: `campus-${school}` }) as never;
const op = (id: string, classId: string, studentId: string, version = 0) => ({ operationId: id, kind: "ATTENDANCE_MARK", classId, date: "2026-11-08", studentId, capturedAt: new Date().toISOString(), base: { status: null, version }, payload: { status: "PRESENT" } });
const svc = () => import("../../src/lib/offline/service");

test("a guardian with a stale base version is refused without the current record", async () => {
  const r = await (await svc()).sync(user("PARENT", "a"), { deviceId: "device-guardian", operations: [op("g-1", "class-a", "pupil-a")] });
  assert.equal(r.outcomes[0].status, "REJECTED_ACCESS");
  assert.equal(r.outcomes[0].server, undefined);
  assert.equal(JSON.stringify(r).includes("att-a"), false);
  assert.equal(saved, 0);
});

test("a teacher of school A cannot probe a school B class or a pupil off their roster", async () => {
  const r = await (await svc()).sync(user("TEACHER", "a"), { deviceId: "device-teacher-a", operations: [op("t-1", "class-b", "pupil-b"), op("t-2", "class-a", "pupil-b")] });
  assert.deepEqual(r.outcomes.map(o => o.status), ["REJECTED_ACCESS", "REJECTED_ACCESS"]);
  assert.equal(JSON.stringify(r).includes("att-b"), false);
});

test("replaying a refused operation still echoes nothing", async () => {
  ops.push({ schoolId: "school-a", operationId: "legacy-1", userId: "PARENT-a", status: "REJECTED_ACCESS", message: "x", serverValue: { id: "att-a" } });
  const r = await (await svc()).sync(user("PARENT", "a"), { deviceId: "device-guardian", operations: [op("legacy-1", "class-a", "pupil-a")] });
  assert.equal(r.outcomes[0].server, undefined);
});

test("a replayed accepted operation is not counted as accepted again", async () => {
  const s = await svc();
  const first = await s.sync(user("TEACHER", "b"), { deviceId: "device-teacher-b", operations: [op("t-b-1", "class-b", "pupil-b", 2)] });
  assert.equal(first.accepted, 1);
  const again = await s.sync(user("TEACHER", "b"), { deviceId: "device-teacher-b", operations: [op("t-b-1", "class-b", "pupil-b", 2)] });
  assert.equal(again.outcomes[0].repeated, true);
  assert.equal(again.accepted, 0);
  assert.equal(saved, 1);
});

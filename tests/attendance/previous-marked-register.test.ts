/**
 * SKAI-1983: "Copy previous register" asks the server once for the newest earlier register with marks in the last
 * week, instead of loading up to seven registers one by one. The lookup keeps the class-access check (two schools,
 * two campuses, a teacher not on the class, a denied role), the 7-day window, and the dated roster.
 */
import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

const SCHOOL = "school-a", CAMPUS = "campus-a";
type Where = Record<string, any>;
const classes = [
  { id: "class-a", schoolId: SCHOOL, campusId: CAMPUS, classTeacherId: "teacher-a", name: "Grade 4", section: "A", academicYear: 2026 },
  { id: "class-b", schoolId: SCHOOL, campusId: "campus-b", classTeacherId: "teacher-b", name: "Grade 4", section: "B", academicYear: 2026 },
  { id: "class-x", schoolId: "school-b", campusId: "campus-x", classTeacherId: "teacher-x", name: "Grade 4", section: "X", academicYear: 2026 },
];
const enrollments = [
  { id: "en-1", studentId: "st-1", classId: "class-a", schoolId: SCHOOL, rollNo: "01", student: { id: "st-1", fullName: "Pupil One", classId: "class-a", profileImageUrl: null } },
  { id: "en-2", studentId: "st-2", classId: "class-a", schoolId: SCHOOL, rollNo: "02", student: { id: "st-2", fullName: "Pupil Two", classId: "class-a", profileImageUrl: null } },
];
const state = { marks: [] as Array<{ studentId: string; date: string }>, attendanceWheres: [] as Where[], classWheres: [] as Where[], enrollmentWheres: [] as Where[] };

const fakePrisma = {
  class: { findFirst: async ({ where }: { where: Where }) => {
    state.classWheres.push(where);
    return classes.find((c) => c.id === where.id && c.schoolId === where.schoolId && (where.campusId === undefined || c.campusId === where.campusId)
      && (!where.OR || c.classTeacherId === where.OR[0].classTeacherId)) ?? null;
  } },
  studentEnrollment: { findMany: async ({ where }: { where: Where }) => {
    state.enrollmentWheres.push(where);
    return enrollments.filter((e) => e.classId === where.classId && e.schoolId === where.schoolId);
  } },
  attendance: { findMany: async ({ where, distinct }: { where: Where; distinct?: string[] }) => {
    state.attendanceWheres.push(where);
    const rows = state.marks.filter((m) => where.studentId.in.includes(m.studentId));
    if (distinct) {
      const inWindow = rows.filter((m) => new Date(`${m.date}T00:00:00Z`) >= where.date.gte && new Date(`${m.date}T00:00:00Z`) < where.date.lt);
      return [...new Set(inWindow.map((m) => m.date))].sort().reverse().map((d) => ({ date: new Date(`${d}T00:00:00Z`) }));
    }
    const day = (where.date as Date).toISOString().slice(0, 10);
    return rows.filter((m) => m.date === day).map((m) => ({ id: `${m.studentId}-${m.date}`, studentId: m.studentId, status: "PRESENT", arrivalTime: null, departureTime: null, notes: null, version: 1, marker: null, explanations: [] }));
  } },
  attendanceRegister: { findUnique: async () => null },
  attendanceRuleVersion: { findFirst: async () => null },
  school: { findUnique: async () => ({ attendanceRegulator: null }) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/attendance/correction-permission", { namedExports: { canCorrectRegister: async () => true } });
mock.module("@/lib/notifications/in-app", { namedExports: { deliverNotification: async () => undefined } });
mock.module("@/lib/notifications/automation", { namedExports: { triggerRepeatedAbsenceAlert: async () => undefined } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => undefined } });
mock.module("@/lib/timetable/locking", { namedExports: { lockTimetableCampus: async () => undefined } });

let register: typeof import("../../src/lib/attendance/register");
before(async () => { register = await import("../../src/lib/attendance/register"); });
beforeEach(() => { state.marks = []; state.attendanceWheres = []; state.classWheres = []; state.enrollmentWheres = []; });

const actor = (role: AuthUser["role"], userId = `user-${role.toLowerCase()}`, campusId = CAMPUS): AuthUser => ({ userId, schoolId: SCHOOL, campusId, role, email: `${role.toLowerCase()}@example.invalid`, institutionKind: "GROUP" });

test("returns the newest earlier register with marks, skipping unmarked days, in one candidate read", async () => {
  state.marks = [{ studentId: "st-1", date: "2026-11-11" }, { studentId: "st-2", date: "2026-11-13" }, { studentId: "st-1", date: "2026-11-16" }];
  const view = await register.previousMarkedRegisterView(actor("CAMPUS_ADMIN"), "class-a", "2026-11-16");
  assert.equal(view?.date, "2026-11-13");
  assert.deepEqual(view?.entries.map((e) => e.status), [null, "PRESENT"]);
  const window = state.attendanceWheres[0];
  assert.equal(window.schoolId, SCHOOL);
  assert.equal(window.date.gte.toISOString().slice(0, 10), "2026-11-09");
  assert.equal(window.date.lt.toISOString().slice(0, 10), "2026-11-16");
  assert.equal(state.enrollmentWheres[0].schoolId, SCHOOL);
});

test("nothing in the last 7 days returns null, so the 'no earlier register' message still applies", async () => {
  state.marks = [{ studentId: "st-1", date: "2026-11-08" }];
  assert.equal(await register.previousMarkedRegisterView(actor("CAMPUS_ADMIN"), "class-a", "2026-11-16"), null);
});

test("another campus, another school and a teacher not on the class get 404; a denied role gets 403", async () => {
  state.marks = [{ studentId: "st-1", date: "2026-11-13" }];
  await assert.rejects(register.previousMarkedRegisterView(actor("CAMPUS_ADMIN"), "class-b", "2026-11-16"), { status: 404 });
  await assert.rejects(register.previousMarkedRegisterView(actor("CAMPUS_ADMIN"), "class-x", "2026-11-16"), { status: 404 });
  await assert.rejects(register.previousMarkedRegisterView(actor("TEACHER", "teacher-b"), "class-a", "2026-11-16"), { status: 404 });
  assert.equal((await register.previousMarkedRegisterView(actor("TEACHER", "teacher-a"), "class-a", "2026-11-16"))?.date, "2026-11-13");
  await assert.rejects(register.previousMarkedRegisterView(actor("PARENT"), "class-a", "2026-11-16"), { status: 403 });
  await assert.rejects(register.previousMarkedRegisterView(actor("STUDENT"), "class-a", "2026-11-16"), { status: 403 });
  assert.equal(state.attendanceWheres.filter((w) => w.date?.gte).length, 1, "only the allowed teacher read attendance");
});

test("a malformed date is refused before any read", async () => {
  await assert.rejects(register.previousMarkedRegisterView(actor("CAMPUS_ADMIN"), "class-a", "16/11/2026"), { status: 400 });
  assert.equal(state.classWheres.length, 0);
});

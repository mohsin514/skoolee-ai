/**
 * SKAI-1931: Attendance exceptions' "Registers not submitted" also counts today's classes whose register was never
 * started (no register row and no attendance), not only registers left OPEN. Weekend days add nothing; a teacher sees
 * only their own classes; every read keeps the school and campus scope.
 */
import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

const SCHOOL = "school-registers", CAMPUS = "campus-registers";
const state = { weekend: [] as number[], classQueries: [] as Array<Record<string, any>> };

const query = (name: string) => async (args?: { where?: Record<string, any> }) => {
  if (name === "class") { state.classQueries.push(args?.where ?? {}); return [{ id: "class-7" }]; }
  return [];
};
const fakePrisma = { class: { findMany: query("class") }, attendance: { findMany: query("attendance") }, attendanceExplanation: { findMany: query("attendanceExplanation") }, attendanceRegister: { findMany: query("attendanceRegister") } };
// Only the reads exceptionQueue makes are stubbed; modules with background handles are replaced so the process exits.
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async (schoolId: string, campusId: string) => {
  assert.equal(schoolId, SCHOOL); assert.equal(campusId, CAMPUS);
  return { timezone: "Asia/Karachi", weekend: state.weekend };
} } });
mock.module("@/lib/notifications/in-app", { namedExports: { deliverNotification: async () => undefined } });
mock.module("@/lib/notifications/automation", { namedExports: { triggerRepeatedAbsenceAlert: async () => undefined } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => undefined } });
mock.module("@/lib/timetable/locking", { namedExports: { lockTimetableCampus: async () => undefined } });

let register: typeof import("../../src/lib/attendance/register");
before(async () => { register = await import("../../src/lib/attendance/register"); });
beforeEach(() => { state.weekend = []; state.classQueries = []; });

const actor = (role: AuthUser["role"]): AuthUser => ({ userId: `user-${role.toLowerCase()}`, schoolId: SCHOOL, campusId: CAMPUS, role, email: `${role.toLowerCase()}@example.invalid`, institutionKind: "GROUP" });
const FRIDAY = "2026-11-13";

test("a class with no register and no attendance today counts as not submitted", async () => {
  const queue = await register.exceptionQueue(actor("CAMPUS_ADMIN"), CAMPUS, FRIDAY);
  assert.deepEqual(queue.notStartedRegisters, [{ date: FRIDAY, classId: "class-7" }]);
  const where = state.classQueries[0];
  assert.equal(where.schoolId, SCHOOL);
  assert.equal(where.campusId, CAMPUS);
  assert.equal(where.archivedAt, null);
  assert.deepEqual(where.attendanceRegisterPlacements, { none: { date: new Date(`${FRIDAY}T00:00:00.000Z`) } }, "a started register is counted as open, not twice");
  assert.deepEqual(where.attendance, { none: { date: new Date(`${FRIDAY}T00:00:00.000Z`) } });
  assert.equal(where.OR, undefined, "campus staff read every class");
});

test("a teacher's count covers only their own classes", async () => {
  await register.exceptionQueue(actor("TEACHER"), CAMPUS, FRIDAY);
  assert.deepEqual(state.classQueries[0].OR, [{ classTeacherId: "user-teacher" }, { subjects: { some: { teacherId: "user-teacher" } } }]);
});

test("a weekend day adds no not-started registers", async () => {
  state.weekend = [5];
  const queue = await register.exceptionQueue(actor("CAMPUS_ADMIN"), CAMPUS, FRIDAY);
  assert.deepEqual(queue.notStartedRegisters, []);
  assert.equal(state.classQueries.length, 0);
});

// SKAI-2055: a paper for a class with a published timetable used to 409 "A published lesson already uses a
// selected room or invigilator" because the class's OWN lessons counted as a clash. On exam days the paper
// replaces those lessons; only a shared room or invigilator may block.
import test from "node:test";
import assert from "node:assert/strict";
import { assertExamReservations } from "../../src/lib/academic/exam-bookings";

const scope = { schoolId: "s", campusId: "c" };
const lesson = { dayOfWeek: 1, startTime: "08:00", endTime: "13:20", roomId: "lesson-room", teacherId: "lesson-teacher", timetable: { academicYear: 2026, term: "ANNUAL", classId: "c1" } };
const period = { id: "p1", startTime: "09:00", endTime: "11:00", timeType: "EXAM" };
const db = {
  periodDefinition: { findMany: async () => [period] },
  examSchedule: { findMany: async () => [] },
  holiday: { findMany: async () => [] },
  school: { findUniqueOrThrow: async () => ({ timezone: "UTC" }) },
  localePolicy: { findMany: async () => [] },
  weekend: { findMany: async () => [{ dayOfWeek: 6 }, { dayOfWeek: 0 }] },
  class: { findMany: async () => [{ id: "c1", academicYear: 2026 }] },
  academicCycle: { findMany: async () => [] },
  user: { findMany: async (a: any) => a.where.id.in.map((id: string) => ({ id })) },
  classRoom: { findMany: async (a: any) => a.where.id.in.map((id: string) => ({ id })) },
  schoolAiSubstituteDuty: { findMany: async () => [] },
  leaveRequest: { findMany: async () => [] },
  // Honours the query: a slot is returned only when one of the OR branches would match it.
  timetableSlot: { findMany: async (args: { where: { OR: Array<Record<string, any>> } }) => args.where.OR.some(b => b.timetable?.classId?.in?.includes("c1") || b.roomId?.in?.includes(lesson.roomId) || b.teacherId?.in?.includes(lesson.teacherId)) ? [lesson] : [] },
} as never;
// 2026-12-07 is a Monday, matching the lesson's dayOfWeek.
const paper = (extra: object = {}) => ({ id: "n", classId: "c1", academicYear: 2026, term: "ANNUAL", date: "2026-12-07", periodDefinitionId: "p1", roomIds: [] as string[], teacherIds: [] as string[], ...extra });

test("a paper with no room or invigilator is placeable over its own class's lessons", async () => {
  await assertExamReservations(db, scope, [paper()]);
});
test("a paper with no fixed time is placeable over its own class's lessons", async () => {
  await assertExamReservations(db, scope, [paper({ periodDefinitionId: null })]);
});
test("a free room and invigilator do not clash with the class's lessons", async () => {
  await assertExamReservations(db, scope, [paper({ roomIds: ["r-free"], teacherIds: ["t-free"] })]);
});

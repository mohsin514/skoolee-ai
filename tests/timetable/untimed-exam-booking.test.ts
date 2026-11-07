// SKAI-1787: one date-sheet row with a room but no time slot used to make every
// timetable save on the campus fail with 409 EXAM_PLAN_EXISTING_INVALID.
import test from "node:test";
import assert from "node:assert/strict";
import { getExamBookings, getExamBookingSlots } from "../../src/lib/academic/exam-bookings";

const row = (id: string, period: { periodNumber: number; startTime: string; endTime: string } | null) => ({
  id, date: new Date("2026-11-16T00:00:00Z"), roomId: "room-1", room: { id: "room-1", roomNumber: "R1" }, periodDefinition: period,
  exam: { classId: "c1", academicYear: 2026, term: "TERM_1", title: `Exam ${id}`, class: { name: "Grade 6", section: null } },
  rooms: [{ roomId: "room-1", room: { id: "room-1", roomNumber: "R1" }, invigilation: { teacherId: "t1", teacher: { id: "t1", fullName: "QA Teacher" } } }],
});
const db = (rows: unknown[]) => ({ examSchedule: { findMany: async () => rows } }) as never;
const scope = { schoolId: "s", campusId: "c" };

test("an untimed exam room booking no longer throws; it is returned separately", async () => {
  const result = await getExamBookings(db([row("timed", { periodNumber: 1, startTime: "09:00", endTime: "10:00" }), row("untimed", null)]), scope);
  assert.equal(result.timed.length, 1);
  assert.equal(result.timed[0].startTime, "09:00");
  assert.equal(result.untimed.length, 1);
  assert.deepEqual({ ...result.untimed[0], examTitle: result.untimed[0].examTitle }, { id: "untimed:room-1", dayOfWeek: 1, roomId: "room-1", roomNumber: "R1", teacherId: "t1", teacherName: "QA Teacher", examTitle: "Exam untimed", className: "Grade 6" });
});

test("the solver feed keeps only timed bookings", async () => {
  const slots = await getExamBookingSlots(db([row("untimed", null), row("bad", { periodNumber: 2, startTime: "11:00", endTime: "10:00" })]), scope);
  assert.deepEqual(slots, []);
});

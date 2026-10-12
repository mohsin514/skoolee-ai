import assert from "node:assert/strict";
import { test } from "node:test";
import { solveTimetable, timetableSolveInputSchema, type SolverWindow } from "../../src/lib/school-ai/timetable-solver";
const window = (dayOfWeek = 1, periodNumber = 1): SolverWindow => ({ dayOfWeek, periodNumber, startTime: periodNumber === 1 ? "08:00" : "09:00", endTime: periodNumber === 1 ? "08:40" : "09:40" });
const requirement = (subjectId = "math", periodsPerWeek = 2) => ({ subjectId, teacherId: "teacher", periodsPerWeek, maxPerDay: 1 });
test("solver honors exact subject counts, daily bounds, room/teacher bookings and is deterministic", () => {
  const input = { requirements: [requirement(), requirement("language")], windows: [1, 2, 3].flatMap(day => [window(day), window(day, 2)]), roomIds: ["r1", "r2"], bookings: [{ ...window(), teacherId: "teacher", roomId: null }, { ...window(2), teacherId: null, roomId: "r1" }] };
  const result = solveTimetable(input);
  assert(result.status === "SOLVED"); assert.deepEqual(solveTimetable(input), result);
  assert.equal(result.slots.length, 4);
  for (const subject of ["math", "language"]) {
    const subjectSlots = result.slots.filter(slot => slot.subjectId === subject); assert.equal(subjectSlots.length, 2);
    assert.equal(new Set(subjectSlots.map(slot => slot.dayOfWeek)).size, 2);
  }
  assert(!result.slots.some(slot => slot.dayOfWeek === 1 && slot.periodNumber === 1));
  assert(!result.slots.some(slot => slot.dayOfWeek === 2 && slot.periodNumber === 1 && slot.roomId === "r1"));
  assert.equal(new Set(result.slots.map(slot => `${slot.dayOfWeek}:${slot.periodNumber}`)).size, 4);
});
test("same room at a nonoverlapping EXAM period number is available; actual overlap is blocked", () => {
  const input = { requirements: [requirement("math", 1)], windows: [window()], roomIds: ["room"], bookings: [{ ...window(), startTime: "09:00", endTime: "10:00", roomId: "room", teacherId: null, clockOnly: true }] };
  assert.equal(solveTimetable(input).status, "SOLVED");
  assert.equal(solveTimetable({ ...input, bookings: [{ ...input.bookings[0], startTime: "08:20" }] }).status, "NO_SOLUTION");
  assert.equal(solveTimetable({ ...input, bookings: [{ ...input.bookings[0], clockOnly: false }] }).status, "NO_SOLUTION");
});
test("multiple rooms cannot satisfy multiple class lessons in one time window", () => {
  const result = solveTimetable({ requirements: [{ ...requirement(), maxPerDay: 2 }], windows: [window()], roomIds: ["a", "b", "c"], bookings: [] });
  assert.equal(result.status, "NO_SOLUTION"); assert.deepEqual(result.slots, []);
});
test("clock overlap across different periods still reserves the whole class", () => {
  assert.equal(solveTimetable({ requirements: [{ ...requirement(), maxPerDay: 2 }], windows: [window(), { ...window(1, 2), startTime: "08:20" }], roomIds: ["a", "b"], bookings: [] }).status, "NO_SOLUTION");
});
test("bounded search never reports its cutoff as proof of impossible constraints", () => {
  const result = solveTimetable({ requirements: [requirement()], windows: [window(), window(2)], roomIds: ["room"], bookings: [] }, 0);
  assert.equal(result.status, "SEARCH_LIMIT"); assert.deepEqual(result.slots, []);
});
test("input rejects duplicate identities, unbounded counts, hidden options and invalid daily limits", () => {
  const valid = { campusId: "campus", classId: "class", term: "ANNUAL", days: [1, 2], roomIds: ["room"], requirements: [{ subjectId: "subject", periodsPerWeek: 2, maxPerDay: 1 }] };
  assert(timetableSolveInputSchema.safeParse(valid).success);
  for (const patch of [{ days: [1, 1] }, { roomIds: ["room", "room"] }, { requirements: [...valid.requirements, ...valid.requirements] }, { publish: true }, { requirements: [{ ...valid.requirements[0], maxPerDay: 0 }] }]) assert(!timetableSolveInputSchema.safeParse({ ...valid, ...patch }).success);
});
test("bounded search agrees with an independent exhaustive oracle over small competing assignments", () => {
  const windows = [window(), window(1, 2), window(2), window(2, 2)];
  for (let mask = 0; mask < 64; mask++) {
    const bookings = windows.flatMap((slot, index) => mask & 1 << index ? [{ ...slot, teacherId: "t1", roomId: null }] : []);
    const requirements = [{ subjectId: "a", teacherId: "t1", periodsPerWeek: 1 + (mask >> 4 & 1), maxPerDay: 1 }, { subjectId: "b", teacherId: "t2", periodsPerWeek: 1 + (mask >> 5 & 1), maxPerDay: 1 }];
    const lessons = requirements.flatMap(subject => Array.from({ length: subject.periodsPerWeek }, () => subject));
    const placed: Array<{ subjectId: string; dayOfWeek: number; cell: number }> = [];
    function oracle(index: number): boolean {
      if (index === lessons.length) return true;
      const lesson = lessons[index];
      for (let cell = 0; cell < windows.length; cell++) {
        const slot = windows[cell];
        if (placed.some(item => item.cell === cell || item.subjectId === lesson.subjectId && item.dayOfWeek === slot.dayOfWeek) || bookings.some(booking => booking.teacherId === lesson.teacherId && booking.dayOfWeek === slot.dayOfWeek && booking.periodNumber === slot.periodNumber)) continue;
        placed.push({ subjectId: lesson.subjectId, dayOfWeek: slot.dayOfWeek, cell });
        if (oracle(index + 1)) return true;
        placed.pop();
      }
      return false;
    }
    assert.equal(solveTimetable({ requirements, windows, bookings, roomIds: ["room"] }).status === "SOLVED", oracle(0), `constraint set ${mask}`);
  }
});

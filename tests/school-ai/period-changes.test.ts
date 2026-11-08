import assert from "node:assert/strict";
import { test } from "node:test";
import { planPeriodChanges } from "../../src/lib/timetable/period-changes";
import { periodChangeCopy } from "../../src/lib/timetable/editor-copy";

test("period changes list only cleared assignments and preserve class assignments and input state", () => {
  const slots = [{ id: "one", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: "subject-one", teacherId: "teacher", roomId: "room", roomNumber: "101" }, { id: "two", dayOfWeek: 1, periodNumber: 2, startTime: "08:40", endTime: "09:20", slotType: "CLASS", subjectId: "subject-two", teacherId: "teacher", roomId: "room", roomNumber: "101" }];
  const before = structuredClone(slots);
  const result = planPeriodChanges(slots, [{ period: 1, start: "08:05", end: "08:40", type: "BREAK" }, { period: 2, start: "08:45", end: "09:20", type: "CLASS" }]);
  assert.deepEqual(result.clearing, [{ slot: slots[0], type: "BREAK" }]);
  assert.deepEqual(result.updates[0], { ...slots[0], startTime: "08:05", slotType: "BREAK", subjectId: null, teacherId: null, roomId: null, roomNumber: null });
  assert.deepEqual(result.updates[1], { ...slots[1], startTime: "08:45" });
  assert.deepEqual(slots, before);
  assert.equal(planPeriodChanges(slots, []).clearing.length, 0);
});

test("assignment review includes legacy room labels and all three complete translations", () => {
  const slot = { id: "legacy", dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: null, teacherId: null, roomId: null, roomNumber: "Legacy room" };
  const result = planPeriodChanges([slot], [{ period: 1, start: "08:00", end: "08:40", type: "PRAYER" }]);
  assert.equal(result.clearing.length, 1); assert.equal(result.updates[0].roomNumber, null);
  for (const language of ["en", "ar", "ur"] as const) assert(Object.values(periodChangeCopy(language)).every(value => value.length > 0));
});

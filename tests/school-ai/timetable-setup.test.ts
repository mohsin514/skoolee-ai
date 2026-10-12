import assert from "node:assert/strict";
import { test } from "node:test";
import { timetableSetupProposalSchema } from "../../src/lib/school-ai/timetable-setup";
import { workflowDataSchema } from "../../src/lib/school-ai/schemas";
import { validateTimetableSlots } from "../../src/lib/timetable/validate";
const slot = { id: "one", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: "subject", teacherId: "teacher", roomId: "room" };
const proposal = { operation: "timetable.create_draft", classId: "class", academicYear: 2026, term: "ANNUAL", slots: [slot] };
test("typed timetable proposals require complete teaching references and reject executable extra fields", () => {
  assert(timetableSetupProposalSchema.safeParse(proposal).success);
  for (const patch of [{ slots: [{ ...slot, teacherId: null }] }, { slots: [{ ...slot, roomId: null }] }, { slots: [{ ...slot, slotType: "BREAK" }] }, { publish: true }, { term: "guess" }]) assert(!timetableSetupProposalSchema.safeParse({ ...proposal, ...patch }).success);
});
test("timetable periods enforce real clock times, unique positions and no within-class overlap", () => {
  for (const change of [{ startTime: "25:00" }, { endTime: "08:00" }, { dayOfWeek: 8 }, { periodNumber: 0 }]) assert(!timetableSetupProposalSchema.safeParse({ ...proposal, slots: [{ ...slot, ...change }] }).success);
  for (const second of [{ ...slot, id: "two" }, { ...slot, id: "two", periodNumber: 2, startTime: "08:20", endTime: "09:00" }]) assert(!timetableSetupProposalSchema.safeParse({ ...proposal, slots: [slot, second] }).success);
  assert(timetableSetupProposalSchema.safeParse({ ...proposal, slots: [slot, { ...slot, id: "two", periodNumber: 2, startTime: "08:40", endTime: "09:00", slotType: "BREAK", subjectId: null, teacherId: null, roomId: null }] }).success);
});
test("typed timetable workflows cannot add a second conflicting subject scope", () => {
  const data = { goal: "Plan", steps: [{ id: "one", title: "Review", status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [], proposal };
  assert(workflowDataSchema.safeParse(data).success);
  assert(!workflowDataSchema.safeParse({ ...data, subjectId: "subject", classId: "class" }).success);
});
test("one period number has one clock window across the weekly grid", () => {
  const second = { ...slot, id: "two", dayOfWeek: 2 };
  assert(timetableSetupProposalSchema.safeParse({ ...proposal, slots: [slot, second] }).success);
  for (const change of [{ startTime: "08:10" }, { endTime: "08:50" }, { startTime: "09:00", endTime: "09:40" }]) {
    const parsed = timetableSetupProposalSchema.safeParse({ ...proposal, slots: [slot, { ...second, ...change }] });
    assert(!parsed.success);
    assert(parsed.error.issues.some(issue => issue.code === "custom" && issue.params?.code === "TIMETABLE_PERIOD_INCONSISTENT"));
  }
});

type TermFilter = { in?: string[]; notIn?: string[] };
type TimetableFilter = { campusId: string; id: { not: string }; academicYear?: number; OR?: Array<{ term: TermFilter }> };
async function validateAgainstKnownTerm(term: string | undefined, existingTerm: string) {
  let captured: TimetableFilter | undefined;
  const client = {
    class: { findFirst: async () => ({ schoolId: "school" }) },
    examSchedule: { findMany: async () => [] },
    student: { count: async () => 0 },
    classRoom: { findMany: async () => [{ id: "room", roomNumber: "1", capacity: 20 }] },
    timetableSlot: { findMany: async (query: { where: { timetable: TimetableFilter } }) => {
      captured = query.where.timetable;
      const included = !captured.OR || captured.OR.some(({ term: filter }) => filter.in?.includes(existingTerm) || filter.notIn && !filter.notIn.includes(existingTerm));
      return included ? [{ dayOfWeek: 1, periodNumber: 1, teacherId: "teacher", roomId: "room", teacher: { fullName: "Assigned teacher" }, room: { roomNumber: "1" }, timetable: { class: { name: "Grade 9", section: null } } }] : [];
    } },
  } as unknown as NonNullable<Parameters<typeof validateTimetableSlots>[1]>;
  const result = await validateTimetableSlots({ campusId: "campus", timetableId: "current", classId: "class", slots: [slot], academicYear: 2026, term }, client);
  assert(captured);
  assert.equal(captured.academicYear, 2026);
  assert.equal(captured.campusId, "campus");
  assert.deepEqual(captured.id, { not: "current" });
  return { result, filter: captured };
}
test("unknown, annual and absent incoming terms retain clashes with all known terms", async () => {
  for (const incoming of ["Legacy custom term", "ANNUAL", undefined]) {
    for (const existing of ["TERM_1", "TERM_2", "TERM_3"]) {
      const { result, filter } = await validateAgainstKnownTerm(incoming, existing);
      assert.equal(filter.OR, undefined);
      assert.equal(result.canPublish, false);
      assert.equal(result.counts.teacher, 1);
      assert.equal(result.counts.room, 1);
    }
  }
});
test("known incoming terms retain annual and legacy clashes while excluding known disjoint terms", async () => {
  for (const existing of ["ANNUAL", "TERM_1", "Legacy custom term"]) assert.equal((await validateAgainstKnownTerm("TERM_1", existing)).result.canPublish, false);
  for (const existing of ["TERM_2", "TERM_3"]) assert.equal((await validateAgainstKnownTerm("TERM_1", existing)).result.canPublish, true);
});

test("full-board validation catches internal resource overlap without confusing adjacent periods or other days", async () => {
  const client = {
    class: { findFirst: async () => ({ schoolId: "school" }) },
    examSchedule: { findMany: async () => [] },
    student: { count: async () => 0 },
    classRoom: { findMany: async () => [{ id: "room", roomNumber: "1", capacity: 20 }] },
    timetableSlot: { findMany: async () => [] },
  } as unknown as NonNullable<Parameters<typeof validateTimetableSlots>[1]>;
  const check = (second: typeof slot) => validateTimetableSlots({ campusId: "campus", timetableId: "current", classId: "class", slots: [slot, second] }, client);
  const overlap = await check({ ...slot, id: "two", periodNumber: 2, startTime: "08:20", endTime: "09:00" });
  assert.equal(overlap.counts.teacher, 1);
  assert.equal(overlap.counts.room, 1);
  assert.equal(overlap.canPublish, false);
  assert.equal((await check({ ...slot, id: "two", periodNumber: 2, startTime: "08:40", endTime: "09:00" })).canPublish, true);
  assert.equal((await check({ ...slot, id: "two", dayOfWeek: 2 })).canPublish, true);
  assert.equal((await check({ ...slot, id: "two", periodNumber: 2, startTime: "08:20", endTime: "09:00", teacherId: "other", roomId: "other" })).canPublish, true);
});

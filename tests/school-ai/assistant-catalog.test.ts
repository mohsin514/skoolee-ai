import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantCatalogQuerySchema, assistantCatalogSelectionSchema, catalogOperationsForFocus, proposalCatalogReferences, assistantCatalogOperations, assistantEntityKinds } from "../../src/lib/school-ai/assistant-catalog";
import { assistantCatalogCopy } from "../../src/components/school-ai/assistant-catalog-copy";
test("general conversations cannot obtain sensitive domain catalogs", () => {
  for (const key of ["work", "runs", "knowledge", "sources", "policies"] as const) assert.equal(catalogOperationsForFocus[key], undefined);
  assert.deepEqual(catalogOperationsForFocus.financeOperations, ["finance.apply_operation"]);
});
test("catalog schemas reject duplicate choices, arbitrary types, invalid dates and oversized selection", () => {
  const query = { operation: "attendance.record_register", classId: "class-a", date: "2026-10-13" };
  assert(assistantCatalogQuerySchema.safeParse(query).success);
  assert(!assistantCatalogQuerySchema.safeParse({ ...query, date: "2026-02-30" }).success);
  assert(!assistantCatalogQuerySchema.safeParse({ ...query, schoolId: "another" }).success);
  const valid = { query, snapshot: "a".repeat(64), selected: [{ kind: "student", id: "student-a" }] };
  assert(assistantCatalogSelectionSchema.safeParse(valid).success);
  assert(!assistantCatalogSelectionSchema.safeParse({ ...valid, selected: [...valid.selected, ...valid.selected] }).success);
  assert(!assistantCatalogSelectionSchema.safeParse({ ...valid, selected: Array.from({ length: 201 }, (_, i) => ({ kind: "student", id: `p-${i}` })) }).success);
});
test("nested existing references are bound while new proposed row identities remain allowed", () => {
  const refs = proposalCatalogReferences({ operation: "timetable.create_school_drafts", timetables: [{ id: "new-timetable", classId: "class", slots: [{ id: "new-slot", subjectId: "subject", teacherId: "teacher", roomId: "room" }] }], other: { duties: [{ slotId: "lesson", teacherId: null }], entries: [{ studentId: "pupil", fromEnrollmentId: "enrollment" }], targetClassId: "next-class" } });
  assert.deepEqual(refs, [{ kind: "class", id: "class" }, { kind: "subject", id: "subject" }, { kind: "teacher", id: "teacher" }, { kind: "room", id: "room" }, { kind: "lesson", id: "lesson" }, { kind: "student", id: "pupil" }, { kind: "enrollment", id: "enrollment" }, { kind: "class", id: "next-class" }]);
});
test("finance, family, seating and calendar references retain their specific entity kinds", () => {
  assert.deepEqual(proposalCatalogReferences({ classIds: ["c"], studentIds: ["s"], bankAccountId: "b", paymentId: "p", accountId: "a", rows: [{ ledgerId: "l", holidayId: "h", expectedTeacherId: "t" }], rooms: [{ separateRoomId: "r", invigilatorId: "i" }], feeGroupId: "g", feeLineIds: ["f"], sourceIds: ["x"] }).map(row => row.kind), ["class", "student", "bank", "payment", "account", "ledger", "holiday", "teacher", "room", "teacher", "feeGroup", "feeLine", "source"]);
});
test("every operation and entity has a complete English Arabic and Urdu label", () => {
  for (const language of ["en", "ar", "ur"] as const) { const copy = assistantCatalogCopy(language); for (const op of assistantCatalogOperations) assert(copy.operations[op]); for (const kind of assistantEntityKinds) assert(copy.kinds[kind]); }
});

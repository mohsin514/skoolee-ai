import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolSetupProposalSchema } from "../../src/lib/school-ai/school-setup";
import { emptySetupRow, setupProposalRows, visibleSetupFields } from "../../src/lib/school-ai/school-setup-input";
import { schoolSetupCopy } from "../../src/components/school-ai/school-setup-copy";
const base = { operation: "setup.apply_changes", sourceReference: "Signed academic register" };
test("subject identity and marks are bounded and teacher changes require explicit previous identities", () => {
  const row = { classId: "class-1", subjectName: "Mathematics", totalMarks: 100 };
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "SUBJECTS", rows: [row] }).success, true);
  for (const rows of [[row, { ...row, subjectName: "MATHEMATICS" }], [{ ...row, totalMarks: 0 }], [{ ...row, totalMarks: 1.5 }]]) assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "SUBJECTS", rows }).success, false);
  const rows = setupProposalRows("TEACHER_ALLOCATIONS", [{ ...emptySetupRow("TEACHER_ALLOCATIONS"), subjectId: "subject-1", teacherId: "teacher-1" }]);
  assert.deepEqual(rows, [{ allocationType: "SUBJECT", subjectId: "subject-1", expectedTeacherId: null, teacherId: "teacher-1" }]);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "TEACHER_ALLOCATIONS", rows }).success, true);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "TEACHER_ALLOCATIONS", rows: [{ allocationType: "CLASS", classId: "class-1", teacherId: "teacher-1" }] }).success, false);
});
test("holiday updates and deletion have distinct fields, real dates and selected academic scope", () => {
  const create = { calendarAction: "CREATE", academicYear: 2026, holidayName: "Winter break", fromDate: "2026-12-20", toDate: "2026-12-25" };
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "HOLIDAYS", rows: [create] }).success, true);
  for (const row of [{ ...create, fromDate: "2026-02-30" }, { ...create, toDate: "2026-12-19" }, { ...create, calendarAction: "UPDATE" }]) assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "HOLIDAYS", rows: [row] }).success, false);
  assert.deepEqual(visibleSetupFields("HOLIDAYS", { calendarAction: "DELETE" }), ["calendarAction", "academicYear", "holidayId"]);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "HOLIDAYS", rows: [{ calendarAction: "DELETE", academicYear: 2026, holidayId: "holiday-1" }] }).success, true);
});
test("weekends require one reviewed set with at least one open and closed day; labels exist in every language", () => {
  const empty = emptySetupRow("WEEKENDS"), row = { ...empty, sundayClosed: true };
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "WEEKENDS", rows: [row] }).success, true);
  for (const rows of [[empty], [row, row], [Object.fromEntries(Object.keys(empty).map(key => [key, true]))]]) assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "WEEKENDS", rows }).success, false);
  for (const language of ["en", "ar", "ur"] as const) for (const key of ["SUBJECTS", "TEACHER_ALLOCATIONS", "HOLIDAYS", "WEEKENDS", "UPDATE", "DELETE", "before", "after", "calendarYear", "synchronizedSlots"] as const) assert.ok(schoolSetupCopy(language)[key].length > 0);
});

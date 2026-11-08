import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolSetupProposalSchema } from "../../src/lib/school-ai/school-setup";
import { readSetupCsv, mapSetupCsv, emptySetupRow, setupProposalRows } from "../../src/lib/school-ai/school-setup-input";
import { schoolSetupCopy } from "../../src/components/school-ai/school-setup-copy";
const base = { operation: "setup.apply_changes", sourceReference: "Signed school register" };
test("setup refuses duplicate rooms, period overlaps, oversized batches and elevated staff roles", () => {
  const row = { roomNumber: "Room A", roomType: "CLASSROOM", rows: 4, benchesPerRow: 5, seatsPerBench: 2, examSeatsPerBench: 1, building: "" };
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "ROOMS", rows: [row] }).success, true);
  for (const rows of [[row, { ...row, roomNumber: "ROOM A" }], [{ ...row, examSeatsPerBench: 3 }], Array(31).fill(row)]) assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "ROOMS", rows }).success, false);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "PERIODS", rows: [{ timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "09:00" }, { timeType: "CLASS", periodNumber: 2, startTime: "08:59", endTime: "10:00" }] }).success, false);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "STAFF", rows: [{ fullName: "Test Admin", email: "admin@example.invalid", phone: "", role: "SUPER_ADMIN" }] }).success, false);
});
test("CSV maps chosen columns, keeps quoted cells, refuses partial rows and never guesses consent", () => {
  const csv = readSetupCsv('Name,Email,Learning,Medical\n"Parent, Example",parent@example.invalid,true,0');
  const [row] = mapSetupCsv("GUARDIANS", csv.rows, { fullName: 0, email: 1, learningRecords: 2, medicalTreatment: 3 });
  assert.equal(row.fullName, "Parent, Example"); assert.equal(row.learningRecords, true); assert.equal(row.medicalTreatment, false); assert.equal(row.finances, false);
  assert.throws(() => mapSetupCsv("GUARDIANS", [["yes"]], { learningRecords: 0 })); assert.throws(() => readSetupCsv("a,b\n1")); assert.throws(() => readSetupCsv("a\n" + "x\n".repeat(31)));
  assert.equal(setupProposalRows("ROOMS", [{ ...emptySetupRow("ROOMS"), rows: "4" }])[0].rows, 4);
});
test("every setup label and error is localized for English, Arabic and Urdu", () => {
  const keys = Object.keys(schoolSetupCopy("en"));
  for (const language of ["ar", "ur"] as const) { const copy = schoolSetupCopy(language); assert.deepEqual(Object.keys(copy), keys); assert.ok(Object.values(copy).every(value => value.trim().length > 0)); assert.notEqual(copy.title, schoolSetupCopy("en").title); }
});
test("migration requires all core datasets, approved source IDs and explicit financial units", () => {
  const rows = ["STUDENTS", "STAFF_ACTIVE", "STAFF_PENDING", "GUARDIANS", "ROOMS", "PERIODS"].map(dataset => ({ dataset, expectedCount: 0 }));
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "MIGRATION_CUTOVER", rows, sourceIds: ["source-1"] }).success, true);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "MIGRATION_CUTOVER", rows, sourceIds: [] }).success, false);
  assert.equal(schoolSetupProposalSchema.safeParse({ ...base, action: "MIGRATION_CUTOVER", rows: [...rows, { dataset: "OPENING_BALANCES", expectedCount: 1, expectedBalance: 100 }], sourceIds: ["source-1"] }).success, false);
  assert.equal(setupProposalRows("MIGRATION_CUTOVER", [{ dataset: "OPENING_BALANCES", expectedCount: "1", currency: "PKR", expectedBalance: "-5.25", academicYear: "2027" }])[0].expectedBalance, -525);
  assert.ok(Number.isNaN(setupProposalRows("MIGRATION_CUTOVER", [{ dataset: "STUDENTS", expectedCount: "" }])[0].expectedCount));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { studentSchema } from "../../src/lib/validators/schemas";
import { studentsCreateSchema } from "../../src/lib/ai-workflows/adapters/tool-schemas";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKAI-942 / SKAI-943: synthetic admission, never real student or guardian data.
const complete = {
  fullName: "Synthetic Pupil", rollNo: "R-1", classId: "class-1",
  guardianName: "Synthetic Guardian", guardianPhone: "+92 300 0000000",
  address: "1 Test Street", city: "Lahore", medicalNotes: "None",
};

const failingPaths = (payload: Record<string, unknown>) => {
  const parsed = studentSchema.safeParse(payload);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
};

test("a complete admission passes server validation", () => {
  assert.deepEqual(failingPaths(complete), []);
});

test("guardian name and phone are required (SKAI-942)", () => {
  for (const field of ["guardianName", "guardianPhone"]) {
    for (const value of [undefined, "", "   "]) {
      assert.ok(failingPaths({ ...complete, [field]: value }).includes(field), `${field}=${JSON.stringify(value)} must be rejected`);
    }
  }
});

test("address, city and medical notes are required (SKAI-943)", () => {
  for (const field of ["address", "city", "medicalNotes"]) {
    for (const value of [undefined, "", "   "]) {
      assert.ok(failingPaths({ ...complete, [field]: value }).includes(field), `${field}=${JSON.stringify(value)} must be rejected`);
    }
  }
});

test("bulk import rows use the same rules, so incomplete rows are flagged per row", () => {
  const { guardianName: _omit, ...withoutGuardian } = complete;
  assert.deepEqual(failingPaths(withoutGuardian), ["guardianName"]);
});

test("the AI students.create tool requires a guardian name too", () => {
  const row = { ...complete, gender: "FEMALE" };
  assert.equal(studentsCreateSchema.safeParse({ students: [row] }).success, true);
  const { guardianName: _omit, ...withoutGuardian } = row;
  assert.equal(studentsCreateSchema.safeParse({ students: [withoutGuardian] }).success, false);
});

test("required-field messages are translated for Urdu and Arabic", () => {
  for (const message of ["Guardian name is required", "Guardian phone number is required", "Street address is required", "City is required", "Medical notes are required (enter 'None' if not applicable)"]) {
    for (const language of ["ur", "ar"] as const) assert.notEqual(translateUi(message, language), message, `${language}: ${message}`);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { studentProfileUpdateSchema } from "../../src/lib/students/profile-update";

test("pupil updates validate identifier and field types before database filtering", () => {
  for (const payload of [{}, { id: {} }, { id: 123 }, { id: "pupil", campusId: {} }, { id: "pupil", classId: ["class"] }, { id: "pupil", guardianPhone: 123 }, { id: "pupil", fullName: null }, { id: "pupil", fullName: "" }]) {
    assert.equal(studentProfileUpdateSchema.safeParse(payload).success, false);
  }
});

test("pupil updates retain nullable text, clearable tags and draft conflict baselines", () => {
  const payload = { id: "pupil", fullName: "Pupil One", gender: "FEMALE", guardianName: null, categoryId: "", groupId: null, dateOfBirth: "2015-03-12", expectedValues: { fullName: "Old name", categoryId: null, dateOfBirth: "2015-03-12" } };
  assert.deepEqual(studentProfileUpdateSchema.parse(payload), payload);
});

test("pupil conflict baselines reject nested database operators and arrays", () => {
  for (const expectedValues of [[], { fullName: { not: "Old name" } }, { gender: true }]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", expectedValues }).success, false);
  }
  assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", expectedValues: null }).success, true);
});

test("the existing unspecified gender option preserves other profile edits", () => {
  for (const gender of [null, ""]) {
    assert.deepEqual(studentProfileUpdateSchema.parse({ id: "pupil", gender, guardianName: "Guardian" }), { id: "pupil", gender, guardianName: "Guardian" });
  }
  assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", gender: "invalid" }).success, false);
});

test("unrelated form metadata never becomes a writable pupil field", () => {
  assert.deepEqual(studentProfileUpdateSchema.parse({ id: "pupil", fullName: "Pupil One", schoolId: "other-school", archivedAt: "2026-01-01" }), { id: "pupil", fullName: "Pupil One" });
});

test("SKAI-164: blood type is a known type or blank, never silently dropped", () => {
  for (const bloodType of ["O+", "AB-", "", null]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", bloodType }).success, true);
  }
  for (const bloodType of ["Z+", "o+", "A positive"]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", bloodType }).success, false);
  }
});

test("SKAI-164: guardian email is a real address or blank", () => {
  for (const guardianEmail of ["guardian@qa-01.test", "", null]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", guardianEmail }).success, true);
  }
  for (const guardianEmail of ["guardian", "guardian@", "@qa-01.test"]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", guardianEmail }).success, false);
  }
});

test("SKAI-164: date of birth is a real date that is not in the future", () => {
  for (const dateOfBirth of ["2015-03-12", "", null]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", dateOfBirth }).success, true);
  }
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  for (const dateOfBirth of [tomorrow, "not a date", "2015-13-45"]) {
    assert.equal(studentProfileUpdateSchema.safeParse({ id: "pupil", dateOfBirth }).success, false);
  }
});

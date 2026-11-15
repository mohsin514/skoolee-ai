import assert from "node:assert/strict";
import { test } from "node:test";
import { apiFieldErrors, studentEditFieldErrors, studentProfileUpdateSchema } from "../../src/lib/students/profile-update";

// SKAI-2094: the student edit form marks each wrong field with the server's message. Synthetic data only.
const NOW = Date.parse("2026-11-15T00:00:00Z");

test("blank name, bad guardian email and future birth date are caught before the request", () => {
  const errors = studentEditFieldErrors({ fullName: "  ", rollNo: "7", guardianEmail: "not-an-email", dateOfBirth: "2031-01-01" }, NOW);
  assert.deepEqual(errors, {
    fullName: "Student name is required",
    guardianEmail: "Enter a valid guardian email address",
    dateOfBirth: "Date of birth cannot be in the future",
  });
});

test("a valid edit has no field errors and blank optional fields are allowed", () => {
  assert.deepEqual(studentEditFieldErrors({ fullName: "A B", rollNo: "7", guardianEmail: "", dateOfBirth: "" }, NOW), {});
});

test("the server reports a null name with the same plain message", () => {
  const result = studentProfileUpdateSchema.safeParse({ id: "s1", fullName: null });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(result.error.flatten().fieldErrors.fullName, ["Student name is required"]);
});

test("apiFieldErrors keeps the first message per field and ignores junk", () => {
  assert.deepEqual(apiFieldErrors({ fullName: ["Student name is required", "x"], guardianEmail: "Bad", n: 3, e: [] }), { fullName: "Student name is required", guardianEmail: "Bad" });
  assert.deepEqual(apiFieldErrors(undefined), {});
});

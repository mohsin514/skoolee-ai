import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2193: the student context sent to the AI model is an allow-list, never the whole Student row.
let captured: { select?: Record<string, unknown>; include?: unknown } = {};
mock.module("../../src/lib/db/prisma.ts", { namedExports: { prisma: { student: { findFirst: async (args: typeof captured) => { captured = args; return null; } } } } });
mock.module("../../src/lib/academic/report-versions.ts", { namedExports: { familyVersion: () => ({}), getPublishedVersion: async () => ({}) } });
mock.module("../../src/lib/auth/policy.ts", { namedExports: { AccessDenied: class extends Error {}, studentScope: () => ({}), publishedReportsWhere: {} } });

test("getStudentContext selects only the fields the AI features need", async () => {
  const { getStudentContext } = await import("../../src/lib/ai/student-context");
  await getStudentContext({ schoolId: "school-a", userId: "u", role: "PARENT" } as never);
  assert.equal(captured.include, undefined);
  assert.deepEqual(Object.keys(captured.select ?? {}).sort(), ["campusId", "class", "classId", "fullName", "id", "reportCards"]);
  for (const field of ["medicalNotes", "allergies", "medications", "specialNeeds", "dateOfBirth", "admissionNo", "emiratesId", "regulatorId", "bloodType"]) assert.equal(field in (captured.select ?? {}), false, field);
});

import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1749: a CLOSED assignment refuses new learner extensions with 409 and writes nothing.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type User = { userId: string; role: string; schoolId: string; campusId: string };
const teacherA: User = { userId: "teacher-a", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
const teacherB: User = { userId: "teacher-b", role: "TEACHER", schoolId: "school-b", campusId: "campus-b" };
const assignments = [
  { id: "asg-a", schoolId: "school-a", campusId: "campus-a", classId: "class-a", status: "RELEASED", currentVersion: 1 },
  { id: "asg-b", schoolId: "school-b", campusId: "campus-b", classId: "class-b", status: "RELEASED", currentVersion: 1 },
];
const teaches: Record<string, string[]> = { "teacher-a": ["class-a"], "teacher-b": ["class-b"] };
const writes: string[] = [];

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const tx = {
  assignment: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => assignments.find((a) => a.id === where.id && a.schoolId === where.schoolId) ?? null },
  assignmentVersion: { findFirst: async ({ where }: { where: { assignmentId: string } }) => ({ assignmentId: where.assignmentId, version: 1, audience: ["learner-a", "learner-b"], dueAt: new Date("2026-11-10T10:00:00Z") }) },
  student: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, classId: "class-a", archivedAt: null }) },
  assignmentExtension: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push("extension"); return { id: "ext-1", ...data }; } },
  auditLog: { create: async () => { writes.push("audit"); return {}; } },
};
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError, canManageOperations: (u: User) => u.role === "PRINCIPAL" } });
mock.module(src("lib/auth/policy.ts"), { namedExports: { studentScope: () => ({}) } });
mock.module(src("lib/chat/policy.ts"), { namedExports: { teacherClassIds: async (id: string) => teaches[id] ?? [] } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module(src("lib/storage/private-upload.ts"), { namedExports: { createPrivateUploadUrl: async () => "", MAX_PRIVATE_UPLOAD_BYTES: 1 } });
mock.module(src("lib/storage/s3.ts"), { namedExports: { readPrivateObject: async () => null } });
mock.module(src("lib/curriculum/service.ts"), { namedExports: { assertObjectivesExist: async () => undefined } });
mock.module(src("lib/locale/store.ts"), { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });

const grant = async (user: User, id: string, studentId = "learner-a") => {
  const { grantExtension } = await import("../../src/lib/assignments/service");
  return grantExtension(user as never, id, { studentId, dueLocal: "2026-11-12T10:00", reason: "Synthetic illness note" });
};

beforeEach(() => { writes.length = 0; for (const a of assignments) a.status = "RELEASED"; });

test("a released assignment still takes an extension", async () => {
  const row = await grant(teacherA, "asg-a");
  assert.equal(row.studentId, "learner-a");
  assert.deepEqual(writes, ["extension", "audit"]);
});

test("a closed assignment refuses a new extension with 409 and writes nothing", async () => {
  assignments[0].status = "CLOSED";
  await assert.rejects(grant(teacherA, "asg-a"), { status: 409 });
  assert.deepEqual(writes, []);
});

test("each school's teacher reaches only their own assignment", async () => {
  await assert.rejects(grant(teacherA, "asg-b"), { status: 404 });
  await assert.rejects(grant(teacherB, "asg-a"), { status: 404 });
  assert.equal((await grant(teacherB, "asg-b", "learner-b")).studentId, "learner-b");
});

test("families and unassigned staff are refused with the same 404", async () => {
  await assert.rejects(grant({ ...teacherA, role: "PARENT" }, "asg-a"), { status: 404 });
  await assert.rejects(grant({ ...teacherA, userId: "teacher-other" }, "asg-a"), { status: 404 });
  assert.deepEqual(writes, []);
});

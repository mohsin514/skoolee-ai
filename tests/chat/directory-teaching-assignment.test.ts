import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1269: teachers allocated through TeachingAssignment (no Class.classTeacherId / Subject.teacherId)
// must still meet the guardians of the children they teach in the Messages directory, and nobody else.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const yesterday = new Date(Date.now() - 86_400_000);
type Row = { teacherId: string | null; classId: string; role: string; effectiveFrom: Date; effectiveTo: Date | null };
const assignments: Row[] = [
  { teacherId: "teacher-a", classId: "class-a", role: "CLASS_TEACHER", effectiveFrom: yesterday, effectiveTo: null },
  { teacherId: "teacher-ended", classId: "class-a", role: "SUBJECT_TEACHER", effectiveFrom: yesterday, effectiveTo: yesterday },
  { teacherId: "teacher-b", classId: "class-b", role: "CLASS_TEACHER", effectiveFrom: yesterday, effectiveTo: null },
];
const students = [
  { id: "student-a", classId: "class-a", studentUserId: null, guardian: "parent-a", class: { name: "Grade 5", section: "A", classTeacherId: null } },
  { id: "student-b", classId: "class-b", studentUserId: null, guardian: "parent-b", class: { name: "Grade 6", section: "B", classTeacherId: null } },
];

type Where = { classId?: { in: string[] }; teacherId?: string | { in: string[] }; role?: string; effectiveFrom?: { lte: Date }; OR?: Array<{ effectiveTo: null | { gt: Date } }> };
function current(row: Row, where: Where) {
  const at = where.effectiveFrom?.lte;
  if (!at || row.effectiveFrom > at || !where.OR) return false;
  return row.effectiveTo === null || row.effectiveTo > at;
}
function matches(row: Row, where: Where) {
  if (!current(row, where)) return false;
  if (where.classId && !where.classId.in.includes(row.classId)) return false;
  if (typeof where.teacherId === "string" && row.teacherId !== where.teacherId) return false;
  if (where.teacherId && typeof where.teacherId === "object" && "in" in where.teacherId && !where.teacherId.in.includes(row.teacherId ?? "")) return false;
  if (where.role && row.role !== where.role) return false;
  return true;
}

const guardianOf = (where: unknown) => JSON.stringify(where).match(/"guardianUserId":"([^"]+)"/)?.[1];

mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      teachingAssignment: { findMany: async ({ where }: { where: Where }) => assignments.filter((row) => matches(row, where)).map(({ teacherId, classId }) => ({ teacherId, classId })) },
      class: { findMany: async () => [] },
      subject: { findMany: async () => [] },
      timetableSlot: { findMany: async () => [] },
      student: {
        findMany: async ({ where }: { where: { classId?: { in: string[] } } }) => {
          const parent = guardianOf(where);
          return students
            .filter((s) => (where.classId ? where.classId.in.includes(s.classId) : s.guardian === parent))
            .map((s) => ({ ...s, fullName: "Synthetic Child", guardianRelationships: [{ guardianUserId: s.guardian }] }));
        },
      },
    },
  },
});

const settings = { parentToSupport: false, studentToSupport: false, parentToParent: false, studentToStudent: false } as never;
const actor = (userId: string, role: "PARENT" | "TEACHER"): AuthUser => ({ userId, schoolId: "school-a", campusId: "campus-a", role, email: "synthetic@example.invalid", accessVersion: 1 });
const idBranches = (where: { OR?: Array<{ id?: { in: string[] } }> } | null) => (where?.OR ?? []).flatMap((branch) => branch.id?.in ?? []);

test("parent reaches the teacher allocated to their child's class, not other classes' or ended allocations", async () => {
  const { reachableWhere } = await import("../../src/lib/chat/directory");
  const ids = idBranches(await reachableWhere(actor("parent-a", "PARENT"), settings) as never);
  assert.ok(ids.includes("teacher-a"));
  assert.ok(!ids.includes("teacher-b"));
  assert.ok(!ids.includes("teacher-ended"));
});

test("allocated teacher reaches only the guardians of their own class", async () => {
  const { reachableWhere } = await import("../../src/lib/chat/directory");
  const ids = idBranches(await reachableWhere(actor("teacher-a", "TEACHER"), settings) as never);
  assert.deepEqual(ids, ["parent-a"]);
  assert.deepEqual(idBranches(await reachableWhere(actor("teacher-ended", "TEACHER"), settings) as never), []);
});

test("the class policy agrees with the directory", async () => {
  const { teacherClassIds } = await import("../../src/lib/chat/policy");
  assert.deepEqual(await teacherClassIds("teacher-a"), ["class-a"]);
  assert.deepEqual(await teacherClassIds("teacher-ended"), []);
});

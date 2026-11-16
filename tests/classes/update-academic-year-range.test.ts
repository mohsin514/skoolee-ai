import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2076: PATCH /api/classes must apply the create rule (whole year 2000-2100) to academicYear.
class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, canManageOperations: () => true } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertSchoolOperational: async () => {} } });
mock.module("@/lib/permissions", { namedExports: { moduleFlags: () => ({ canEdit: true, canDelete: true }) } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => {} } });
mock.module("@/lib/timetable/locking", { namedExports: { lockTimetableCampus: async () => {} } });
mock.module("@/lib/api/timetable-sync", { namedExports: { syncTimetableSlotsForSubjects: async () => ({}) } });
mock.module("@/lib/academic/subject-catalogue", { namedExports: { assertSubjectCodeFree: async () => {}, normalizeSubjectCode: (v: string) => v } });
mock.module("@/lib/academic/teaching-mode", { namedExports: { parseTeachingMode: (v: unknown) => v } });
mock.module("@/lib/academic/structure", {
  namedExports: { effectiveDate: () => new Date("2026-11-01T00:00:00Z"), findDuplicateClass: async () => null, findDuplicateSubject: async () => null, recordTeachingAssignment: async () => {} },
});

const user = { userId: "u1", schoolId: "s1", campusId: "c1", role: "CAMPUS_ADMIN" } as never;
const existing = { id: "k1", campusId: "c1", classTeacherId: null, teachingMode: "CLASS_TEACHER", academicYear: 2026, name: "A", section: "A", capacity: null, archivedAt: null };
let updated: Record<string, unknown> | null = null;
const tx = {
  user: { findFirst: async () => ({ role: "CAMPUS_ADMIN", campusId: "c1", accessVersion: 0 }) },
  rolePermission: { findMany: async () => [] },
  class: {
    findFirst: async () => existing,
    update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; return { ...existing, ...data }; },
  },
  timetable: { count: async () => 0 },
  auditLog: { create: async () => ({}) },
} as never;

const load = async () => (await import("../../src/lib/api/teacher-assignments")).updateClassWithTeacherAssignmentTx;

for (const bad of [1, -5, 1999, 2101, 3000, 99999, 2026.5, "abc"]) {
  test(`rejects academicYear ${String(bad)}`, async () => {
    updated = null;
    const updateClassWithTeacherAssignmentTx = await load();
    await assert.rejects(updateClassWithTeacherAssignmentTx(tx, user, { id: "k1", academicYear: bad } as never, "c1"), (e: ApiError) => e.status === 400);
    assert.equal(updated, null);
  });
}

for (const ok of [2000, 2026, 2100]) {
  test(`accepts academicYear ${ok}`, async () => {
    updated = null;
    const updateClassWithTeacherAssignmentTx = await load();
    await updateClassWithTeacherAssignmentTx(tx, user, { id: "k1", academicYear: ok } as never, "c1");
    assert.equal((updated as unknown as Record<string, unknown>).academicYear, ok);
  });
}

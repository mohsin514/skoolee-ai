import assert from "node:assert/strict";
import { mock, test } from "node:test";

let leader = false;
const groupByCalls: Array<{ where: Record<string, unknown> }> = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      class: { findMany: async ({ where }: { where: { OR?: unknown } }) => (where.OR ? [{ id: "class-7a" }] : []) },
      studentClassHistory: { groupBy: async (args: { where: Record<string, unknown> }) => { groupByCalls.push(args); return []; } },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error {},
    assertStaffRole: () => {},
    canLeadAcademics: async () => leader,
    errorResponse: (error: unknown) => { throw error; },
    requireAuthUser: async () => ({ userId: "teacher-t", schoolId: "school-a", role: "TEACHER" }),
    resolveCampusId: async () => "campus-a",
  },
});

const loadGet = async () => (await import("../../src/app/api/academic-year/history/route")).GET;
const request = (url: string) => ({ nextUrl: new URL(url) }) as never;

test("teacher year totals only count history for classes they teach", async () => {
  leader = false; groupByCalls.length = 0;
  await (await loadGet())(request("http://x/api/academic-year/history?campusId=campus-a&academicYear=2026"));
  assert.deepEqual(groupByCalls[0].where, { campusId: "campus-a", academicYear: 2026, classId: { in: ["class-7a"] } });
});

test("academic leaders keep campus-wide totals", async () => {
  leader = true; groupByCalls.length = 0;
  await (await loadGet())(request("http://x/api/academic-year/history?campusId=campus-a&academicYear=2026"));
  assert.deepEqual(groupByCalls[0].where, { campusId: "campus-a", academicYear: 2026 });
});

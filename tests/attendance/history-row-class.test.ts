import assert from "node:assert/strict";
import { mock, test } from "node:test";

const groupByCalls: Array<{ where: Record<string, unknown> }> = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      class: { findFirst: async () => ({ id: "class-7b" }) },
      student: { count: async () => 2, findMany: async () => [{ id: "moved-pupil" }, { id: "other" }] },
      attendance: { groupBy: async (args: { where: Record<string, unknown> }) => { groupByCalls.push(args); return []; } },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error {},
    canMarkAttendance: () => true,
    errorResponse: (error: unknown) => { throw error; },
    requireAuthUser: async () => ({ userId: "staff", schoolId: "school-a", campusId: "campus-a", role: "ADMIN" }),
    resolveCampusId: async () => "campus-a",
  },
});

test("class history counts only rows taken for that class, not the current roster's earlier classes", async () => {
  const { GET } = await import("../../src/app/api/attendance/history/route");
  await GET({ url: "http://x/api/attendance/history?classId=class-7b" } as never);
  assert.deepEqual(groupByCalls[0].where, { campusId: "campus-a", classId: "class-7b" });
});

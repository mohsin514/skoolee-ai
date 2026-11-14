import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-375 (AC3): GET /api/fees/discount-assignments must deny non-finance roles, never list another school's
// or another campus's assignments, and never run a database read for a denied role.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "ACCOUNTANT"];
const state = {
  user: null as Record<string, unknown> | null,
  assignments: [] as Record<string, unknown>[],
  findManyCalls: 0,
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageFinance: (user: { role: string }) => FINANCE_ROLES.includes(user.role),
    assertPermission: async () => undefined,
    assertFeesRead: async () => undefined,
    scopedCampusWhere: (user: { schoolId: string }, campusId?: string | null) => ({
      campus: { schoolId: user.schoolId, ...(campusId ? { id: campusId } : {}) },
    }),
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
mock.module(src("lib/auth/institution.ts"), {
  namedExports: { isInstitutionAuthority: (user: { role: string }) => user.role === "SUPER_ADMIN" || user.role === "ADMIN" },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      feeDiscountAssignment: {
        findMany: async ({ where }: { where: { student: { campus: { schoolId: string; id?: string } } } }) => {
          state.findManyCalls += 1;
          const campus = where.student.campus;
          return state.assignments.filter((a) => a.schoolId === campus.schoolId && (!campus.id || a.campusId === campus.id));
        },
      },
    },
  },
});
mock.module(src("lib/destructive/operations.ts"), { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
mock.module(src("lib/fees/assign-discount-command.ts"), { namedExports: { assignDiscount: async () => ({}) } });
mock.module(src("lib/api/validate.ts"), { namedExports: { parseBody: async () => ({}) } });
mock.module(src("lib/validators/route-bodies.ts"), { namedExports: { jsonObjectBody: {} } });

const get = (url = "http://local/api/fees/discount-assignments") => new Request(url, { method: "GET" }) as never;

beforeEach(() => {
  state.findManyCalls = 0;
  state.assignments = [
    { id: "da-a1", schoolId: "school-a", campusId: "campus-a1", studentId: "s-a1" },
    { id: "da-a2", schoolId: "school-a", campusId: "campus-a2", studentId: "s-a2" },
    { id: "da-b1", schoolId: "school-b", campusId: "campus-b1", studentId: "s-b1" },
  ];
});

test("an accountant pinned to campus a1 at school A sees only that campus's assignments", async () => {
  state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  const res = await GET(get());
  assert.equal(res.status, 200);
  const ids = ((await res.json()).data as { id: string }[]).map((a) => a.id);
  assert.deepEqual(ids, ["da-a1"]);
});

test("an accountant at school B cannot see school A assignments", async () => {
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  const ids = ((await (await GET(get())).json()).data as { id: string }[]).map((a) => a.id);
  assert.deepEqual(ids, ["da-b1"]);
});

for (const role of ["TEACHER", "GUARDIAN", "STUDENT"]) {
  test(`a ${role} is denied the assignment list with no database read`, async () => {
    state.user = { userId: "u-1", role, schoolId: "school-a", campusId: "campus-a1" };
    const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
    const res = await GET(get());
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(state.findManyCalls, 0);
    assert.equal(JSON.stringify(body).includes("s-a1"), false);
  });
}

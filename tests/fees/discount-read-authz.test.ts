import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-374 (AC3): GET /api/fees/discounts must deny non-finance roles and never list another school's discounts.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "ACCOUNTANT"];
const state = {
  user: null as Record<string, unknown> | null,
  discounts: [] as Record<string, unknown>[],
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
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      feeDiscount: {
        findMany: async ({ where }: { where: { campus: { schoolId: string; id?: string } } }) => {
          state.findManyCalls += 1;
          return state.discounts.filter((d) => (d.schoolId === where.campus.schoolId) && (!where.campus.id || d.campusId === where.campus.id));
        },
      },
    },
  },
});
mock.module(src("lib/destructive/operations.ts"), { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
mock.module(src("lib/fees/discount-command.ts"), { namedExports: { createDiscount: async () => ({}) } });
mock.module(src("lib/api/validate.ts"), { namedExports: { parseBody: async (_req: unknown, _schema: unknown) => ({}) } });
mock.module(src("lib/validators/route-bodies.ts"), { namedExports: { idBody: {}, jsonObjectBody: {} } });

const get = (url = "http://local/api/fees/discounts") => new Request(url, { method: "GET" }) as never;

beforeEach(() => {
  state.findManyCalls = 0;
  state.discounts = [
    { id: "d-a1", name: "Sibling", code: "SIB", schoolId: "school-a", campusId: "campus-a1", assignments: [{ id: "x", studentId: "s-a1" }] },
    { id: "d-a2", name: "Staff", code: "STF", schoolId: "school-a", campusId: "campus-a2", assignments: [] },
    { id: "d-b1", name: "Other school", code: "OTH", schoolId: "school-b", campusId: "campus-b1", assignments: [{ id: "y", studentId: "s-b1" }] },
  ];
});

test("an accountant at school A lists only school A discounts", async () => {
  state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  const { GET } = await import("../../src/app/api/fees/discounts/route");
  const res = await GET(get());
  assert.equal(res.status, 200);
  const ids = ((await res.json()).data as { id: string }[]).map((d) => d.id);
  assert.deepEqual(ids.sort(), ["d-a1"]);
});

test("a school owner at another school cannot see school A discounts", async () => {
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" };
  const { GET } = await import("../../src/app/api/fees/discounts/route");
  const ids = ((await (await GET(get())).json()).data as { id: string }[]).map((d) => d.id);
  assert.deepEqual(ids, ["d-b1"]);
});

for (const role of ["TEACHER", "GUARDIAN", "STUDENT"]) {
  test(`a ${role} is denied the discount list with no database read`, async () => {
    state.user = { userId: "u-1", role, schoolId: "school-a", campusId: "campus-a1" };
    const { GET } = await import("../../src/app/api/fees/discounts/route");
    const res = await GET(get());
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(state.findManyCalls, 0);
    assert.equal(JSON.stringify(body).includes("SIB"), false);
  });
}

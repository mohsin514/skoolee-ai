import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-2021: GET /api/fees/discount-assignments is finance data, campus-pinned, and fails closed without a campus.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "ACCOUNTANT"];
const state = { user: null as Record<string, unknown> | null, rows: [] as Record<string, unknown>[], findManyCalls: 0, feesView: true };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageFinance: (user: { role: string }) => FINANCE_ROLES.includes(user.role),
    assertFeesRead: async () => { if (!state.feesView) throw new ApiError("Insufficient permissions: fees.view", 403); },
    assertPermission: async () => undefined,
    scopedCampusWhere: () => ({}),
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
          const c = where.student.campus;
          return state.rows.filter((r) => r.schoolId === c.schoolId && (!c.id || r.campusId === c.id));
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

const get = () => new Request("http://local/api/fees/discount-assignments", { method: "GET" }) as never;
const ids = async (res: Response) => ((await res.json()).data as { id: string }[]).map((r) => r.id).sort();

beforeEach(() => {
  state.findManyCalls = 0;
  state.feesView = true;
  state.rows = [
    { id: "a1", schoolId: "school-a", campusId: "campus-a1" },
    { id: "a2", schoolId: "school-a", campusId: "campus-a2" },
    { id: "b1", schoolId: "school-b", campusId: "campus-b1" },
  ];
});

for (const role of ["TEACHER", "GUARDIAN", "STUDENT", "LIBRARIAN", "RECEPTIONIST"]) {
  test(`a ${role} is denied the assignment list with no database read`, async () => {
    state.user = { userId: "u-1", role, schoolId: "school-a", campusId: "campus-a1" };
    const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
    const res = await GET(get());
    assert.equal(res.status, 403);
    assert.equal(state.findManyCalls, 0);
  });
}

test("an accountant without fees.view is denied", async () => {
  state.feesView = false;
  state.user = { userId: "acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  assert.equal((await GET(get())).status, 403);
  assert.equal(state.findManyCalls, 0);
});

test("a campus-pinned accountant sees only their campus", async () => {
  state.user = { userId: "acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  const res = await GET(get());
  assert.equal(res.status, 200);
  assert.deepEqual(await ids(res), ["a1"]);
});

test("a campus-less accountant fails closed", async () => {
  state.user = { userId: "acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: null };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  const res = await GET(get());
  assert.equal(res.status, 403);
  assert.equal(state.findManyCalls, 0);
});

test("an institution admin sees every campus of their own school only", async () => {
  state.user = { userId: "adm", role: "ADMIN", schoolId: "school-a", campusId: null };
  const { GET } = await import("../../src/app/api/fees/discount-assignments/route");
  assert.deepEqual(await ids(await GET(get())), ["a1", "a2"]);
});

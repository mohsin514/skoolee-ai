import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-377 (AC3): GET /api/fees/carry-forwards must deny non-finance roles, stay within the school and campus,
// and POST must default the currency to the student's campus currency instead of PKR.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "ACCOUNTANT"];
const state = {
  user: null as Record<string, unknown> | null,
  forwards: [] as Record<string, unknown>[],
  findManyCalls: 0,
  students: [] as Record<string, unknown>[],
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
    scopedCampusWhere: () => ({}),
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
mock.module(src("lib/auth/policy.ts"), {
  namedExports: {
    campusScope: (user: { role: string; schoolId: string; campusId?: string }) =>
      user.role === "SUPER_ADMIN" ? { schoolId: user.schoolId } : { schoolId: user.schoolId, campusId: user.campusId },
  },
});
mock.module(src("lib/locale/store.ts"), {
  namedExports: {
    getLocalePackage: async (schoolId: string, campusId: string) => ({ currency: schoolId === "school-b" && campusId === "campus-b1" ? "AED" : "PKR" }),
  },
});
mock.module(src("lib/locale/package.ts"), { namedExports: { CURRENCIES: ["PKR", "AED", "USD"] } });
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      feeCarryForward: {
        findMany: async ({ where }: { where: { student: { campus: { schoolId: string }; campusId?: string } } }) => {
          state.findManyCalls += 1;
          return state.forwards.filter((f) => (f.schoolId === where.student.campus.schoolId)
            && (!where.student.campusId || f.campusId === where.student.campusId));
        },
        findUnique: async () => null,
      },
      student: {
        findFirst: async ({ where }: { where: { id: string } }) => state.students.find((s) => s.id === where.id) ?? null,
      },
      $transaction: async (fn: (tx: unknown) => unknown) => fn({
        feeCarryForward: { create: async ({ data }: { data: unknown }) => ({ id: "cf-new", ...(data as object) }) },
      }),
    },
  },
});
mock.module(src("lib/destructive/operations.ts"), { namedExports: { operationDeleteResponse: async () => new Response(null, { status: 405 }) } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
const bodyState = { bodyForPost: {} as Record<string, unknown> };
mock.module(src("lib/api/validate.ts"), { namedExports: { parseBody: async () => bodyState.bodyForPost } });
mock.module(src("lib/validators/route-bodies.ts"), { namedExports: { requiredIdBody: () => ({}) } });

const get = () => new Request("http://local/api/fees/carry-forwards", { method: "GET" }) as never;

beforeEach(() => {
  state.findManyCalls = 0;
  state.forwards = [
    { id: "cf-a1", schoolId: "school-a", campusId: "campus-a1", balance: 100, student: { id: "s-a1" } },
    { id: "cf-a2", schoolId: "school-a", campusId: "campus-a2", balance: 200, student: { id: "s-a2" } },
    { id: "cf-b1", schoolId: "school-b", campusId: "campus-b1", balance: 300, student: { id: "s-b1" } },
  ];
  state.students = [{ id: "s-b1", campusId: "campus-b1" }];
});

test("an accountant at school A lists only school A carry-forwards on their own campus", async () => {
  state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  const { GET } = await import("../../src/app/api/fees/carry-forwards/route");
  const res = await GET(get());
  assert.equal(res.status, 200);
  const ids = ((await res.json()).data as { id: string }[]).map((d) => d.id);
  assert.deepEqual(ids, ["cf-a1"]);
});

test("a school admin at school B cannot see school A carry-forwards", async () => {
  state.user = { userId: "adm-b", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" };
  const { GET } = await import("../../src/app/api/fees/carry-forwards/route");
  const ids = ((await (await GET(get())).json()).data as { id: string }[]).map((d) => d.id);
  assert.deepEqual(ids, ["cf-b1"]);
});

for (const role of ["TEACHER", "GUARDIAN", "STUDENT"]) {
  test(`a ${role} is denied the carry-forward list with no database read`, async () => {
    state.user = { userId: "u-1", role, schoolId: "school-a", campusId: "campus-a1" };
    const { GET } = await import("../../src/app/api/fees/carry-forwards/route");
    const res = await GET(get());
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(state.findManyCalls, 0);
    assert.equal(JSON.stringify(body).includes("cf-a1"), false);
  });
}

test("POST without a currency uses the student's campus currency, not PKR", async () => {
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" };
  bodyState.bodyForPost = { studentId: "s-b1", fromAcademicYear: 2025, toAcademicYear: 2026, balance: 500 };
  const { POST } = await import("../../src/app/api/fees/carry-forwards/route");
  const res = await POST(new Request("http://local/api/fees/carry-forwards", { method: "POST" }) as never);
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.currency, "AED");
});

import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1762: GET /api/payroll/report returns only the runs inside the requested month range.
type Run = { id: string; schoolId: string; campusId: string; year: number; month: number; lines: { basic: number; allowances: number; deductions: number; bonus: number; net: number; status: string }[] };
type Clause = { year: number | { gt: number; lt: number }; month?: { gte?: number; lte?: number } };
const runs: Run[] = [];
const line = (net: number) => [{ basic: net, allowances: 0, deductions: 0, bonus: 0, net, status: "PAID" }];
const seed = () => {
  runs.length = 0;
  for (const [campusId, schoolId] of [["campus-a", "school-a"], ["campus-b", "school-b"]]) {
    for (const [year, month] of [[2025, 10], [2025, 11], [2025, 12], [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 12]]) {
      runs.push({ id: `${campusId}-${year}-${month}`, schoolId, campusId, year, month, lines: line(100) });
    }
  }
};
const matches = (run: Run, c: Clause) =>
  (typeof c.year === "number" ? run.year === c.year : run.year > c.year.gt && run.year < c.year.lt) &&
  (c.month?.gte === undefined || run.month >= c.month.gte) && (c.month?.lte === undefined || run.month <= c.month.lte);

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const state = { user: { userId: "ops-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" } };
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      payrollRun: {
        findMany: async ({ where }: { where: { campusId: string; OR: Clause[] } }) =>
          runs.filter((r) => r.schoolId === state.user.schoolId && r.campusId === where.campusId && where.OR.some((c) => matches(r, c)))
            .sort((a, b) => a.year - b.year || a.month - b.month),
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageCampusOps: (u: { role: string }) => ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN"].includes(u.role),
    resolveCampusId: async (u: { campusId: string }, requested: string | null) => {
      if (requested && requested !== u.campusId) throw new ApiError("Campus is outside your account", 403);
      return u.campusId;
    },
    errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof ApiError ? e.status : 500 }),
  },
});

const report = async (query: string) => {
  const { GET } = await import("../../src/app/api/payroll/report/route");
  const res = await GET(new Request(`http://local/api/payroll/report?${query}`) as never);
  const body = await res.json();
  return { status: res.status, months: (body.data?.runs ?? []).map((r: Run) => `${r.year}-${r.month}`), net: body.data?.grand.net };
};

beforeEach(() => { seed(); state.user = { userId: "ops-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" }; });

test("a same-year range returns only its months and totals only them", async () => {
  const r = await report("from=2026-03&to=2026-05");
  assert.equal(r.status, 200);
  assert.deepEqual(r.months, ["2026-3", "2026-4", "2026-5"]);
  assert.equal(r.net, 300);
});

test("a cross-year range keeps both boundary months and nothing outside", async () => {
  assert.deepEqual((await report("from=2025-11&to=2026-02")).months, ["2025-11", "2025-12", "2026-1", "2026-2"]);
});

test("two schools each see only their own campus's runs", async () => {
  assert.ok((await report("from=2026-03&to=2026-03")).months.length === 1);
  assert.equal((await report("campusId=campus-b&from=2026-03&to=2026-05")).status, 403);
  state.user = { userId: "ops-b", role: "CAMPUS_ADMIN", schoolId: "school-b", campusId: "campus-b" };
  const b = await report("from=2026-03&to=2026-05");
  assert.deepEqual(b.months, ["2026-3", "2026-4", "2026-5"]);
});

test("roles without campus operations are refused with 403", async () => {
  for (const role of ["PRINCIPAL", "TEACHER", "PARENT"]) {
    state.user = { ...state.user, role };
    assert.equal((await report("from=2026-03&to=2026-05")).status, 403, role);
  }
});

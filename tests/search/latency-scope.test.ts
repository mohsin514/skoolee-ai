import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1245: record search used to make one permission round trip per record type, then the scope lookup, then the
// searches, then the header lookup, all in sequence. These tests pin the overlap, the caps and the tenant scope.
let inFlight = 0;
let peak = 0;
const calls: Array<{ model: string; args: Record<string, unknown> }> = [];
const slow = <T>(model: string, value: T) => async (args: Record<string, unknown> = {}) => {
  calls.push({ model, args });
  inFlight++; peak = Math.max(peak, inFlight);
  await new Promise(resolve => setTimeout(resolve, 20));
  inFlight--;
  return value;
};
const raw: string[] = [];
let permissionPeak = 0;
let permissionInFlight = 0;
const denied = new Set<string>();

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        raw.push(strings.join("?") + JSON.stringify(values));
        await new Promise(resolve => setTimeout(resolve, 20));
        return strings.join("").includes("count(*)") ? [{ total: BigInt(0) }] : [];
      },
      student: { findMany: slow("student", []) },
      class: { findMany: slow("class.findMany", []), count: slow("class.count", 0) },
      user: { findMany: slow("user.findMany", []), count: slow("user.count", 0) },
      admissionApplication: { findMany: slow("application.findMany", []), count: slow("application.count", 0) },
      school: { findUnique: slow("school", { name: "QA-01 School" }) },
      campus: { findUnique: slow("campus", { name: "QA-01 Campus" }), findFirst: slow("campus.findFirst", { id: "campus-a" }) },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } },
    isFamilyRole: () => false,
    assertModuleRead: async (_user: unknown, module: string) => {
      permissionInFlight++; permissionPeak = Math.max(permissionPeak, permissionInFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      permissionInFlight--;
      if (denied.has(module)) throw new Error("denied");
    },
  },
});

const load = () => import("../../src/lib/search/service");
const admin = (schoolId: string, campusId: string): Record<string, unknown> => ({ userId: `admin-${schoolId}`, schoolId, campusId, role: "CAMPUS_ADMIN" });
const reset = () => { calls.length = 0; raw.length = 0; peak = 0; permissionPeak = 0; denied.clear(); };

test("permission checks and per-type searches run in parallel, each capped", async () => {
  const { searchRecords, parseFilters } = await load();
  reset();
  const data = await searchRecords(admin("school-a", "campus-a") as never, parseFilters(new URLSearchParams("q=Aisha")));
  assert.deepEqual(data.types, ["student", "class", "staff", "application"]);
  assert.ok(permissionPeak > 1, "module checks overlap");
  assert.ok(peak > 2, "entity searches overlap");
  for (const call of calls.filter(c => c.model.endsWith("findMany") && c.model !== "student")) assert.equal(call.args.take, 8);
  assert.ok(raw.some(sql => sql.includes("LIMIT") && sql.includes("8,0")));
});

test("each school's search stays inside its own school and campus", async () => {
  const { searchRecords, parseFilters } = await load();
  for (const [schoolId, campusId] of [["school-a", "campus-a"], ["school-b", "campus-b"]]) {
    reset();
    await searchRecords(admin(schoolId, campusId) as never, parseFilters(new URLSearchParams("q=Aisha")));
    for (const call of calls.filter(c => /count|findMany/.test(c.model))) {
      const where = call.args.where as Record<string, unknown>;
      assert.equal(where.schoolId, schoolId);
      assert.deepEqual(where.campusId, { in: [campusId] });
    }
    for (const sql of raw) { assert.ok(sql.includes(schoolId)); assert.ok(sql.includes(campusId)); assert.ok(!sql.includes(schoolId === "school-a" ? "school-b" : "school-a")); }
  }
});

test("a denied module is not searched, and no permission at all is still refused", async () => {
  const { searchRecords, parseFilters } = await load();
  reset();
  denied.add("admissions");
  const data = await searchRecords(admin("school-a", "campus-a") as never, parseFilters(new URLSearchParams("q=Aisha")));
  assert.deepEqual(data.allowedTypes, ["student", "class", "staff"]);
  assert.ok(!calls.some(c => c.model.startsWith("application")));
  reset();
  for (const m of ["students", "staff", "admissions"]) denied.add(m);
  await assert.rejects(searchRecords(admin("school-a", "campus-a") as never, parseFilters(new URLSearchParams("q=Aisha"))), /no searchable records/);
  await assert.rejects(searchRecords({ ...admin("school-a", "campus-a"), role: "TEACHER" } as never, parseFilters(new URLSearchParams("q=x"))), /not part of your workspace/);
});

test("an account without a campus is still refused once permissions pass", async () => {
  const { searchRecords, parseFilters } = await load();
  reset();
  await assert.rejects(searchRecords({ ...admin("school-a", "campus-a"), campusId: null } as never, parseFilters(new URLSearchParams("q=x"))), /not linked to a campus/);
});

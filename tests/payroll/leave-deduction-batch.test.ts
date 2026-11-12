import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1861: generating a payroll run used to await one unpaid-leave lookup per staff member, one after another.
// The run now loads every staff member's approved leave and allocations in two school- and campus-scoped queries
// and applies the same per-user calculation (a per-user allocation still beats the role-wide one).
type Row = Record<string, any>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };

const MARCH_START = new Date(Date.UTC(2026, 2, 1));
const MARCH_END = new Date(Date.UTC(2026, 3, 1));

let staffRows: Row[] = [];
const leaveRequests: Row[] = [
  // school-a / campus-a1, March 2026
  { schoolId: "school-a", campusId: "campus-a1", userId: "t1", leaveTypeId: "sick", status: "APPROVED", days: 40, fromDate: new Date("2026-03-02"), toDate: new Date("2026-03-05") },
  { schoolId: "school-a", campusId: "campus-a1", userId: "t2", leaveTypeId: "sick", status: "APPROVED", days: 40, fromDate: new Date("2026-03-02"), toDate: new Date("2026-03-05") },
  { schoolId: "school-a", campusId: "campus-a1", userId: "p1", leaveTypeId: "sick", status: "APPROVED", days: 30, fromDate: new Date("2026-02-27"), toDate: new Date("2026-03-01") },
  // ignored: not approved, outside the month, other campus, other school
  { schoolId: "school-a", campusId: "campus-a1", userId: "t1", leaveTypeId: "sick", status: "PENDING", days: 90, fromDate: new Date("2026-03-10"), toDate: new Date("2026-03-18") },
  { schoolId: "school-a", campusId: "campus-a1", userId: "t1", leaveTypeId: "sick", status: "APPROVED", days: 90, fromDate: new Date("2026-04-01"), toDate: new Date("2026-04-09") },
  { schoolId: "school-a", campusId: "campus-a2", userId: "t1", leaveTypeId: "sick", status: "APPROVED", days: 90, fromDate: new Date("2026-03-10"), toDate: new Date("2026-03-18") },
  { schoolId: "school-b", campusId: "campus-a1", userId: "t1", leaveTypeId: "sick", status: "APPROVED", days: 90, fromDate: new Date("2026-03-10"), toDate: new Date("2026-03-18") },
];
const leaveAllocations: Row[] = [
  { schoolId: "school-a", campusId: "campus-a1", academicYear: 2026, leaveTypeId: "sick", role: "TEACHER", userId: null, days: 20 },
  { schoolId: "school-a", campusId: "campus-a1", academicYear: 2026, leaveTypeId: "sick", role: null, userId: "t2", days: 50 },
  // ignored: other year, other campus, other school
  { schoolId: "school-a", campusId: "campus-a1", academicYear: 2025, leaveTypeId: "sick", role: "PRINCIPAL", userId: null, days: 300 },
  { schoolId: "school-a", campusId: "campus-a2", academicYear: 2026, leaveTypeId: "sick", role: "PRINCIPAL", userId: null, days: 300 },
  { schoolId: "school-b", campusId: "campus-a1", academicYear: 2026, leaveTypeId: "sick", role: "TEACHER", userId: null, days: 300 },
];
const leaveQueries: Array<{ model: string; where: Row }> = [];

const inList = (value: unknown, filter: unknown) =>
  filter && typeof filter === "object" && "in" in (filter as Row) ? ((filter as Row).in as unknown[]).includes(value) : value === filter;

const prisma = {
  user: { findMany: async ({ where }: { where: Row }) => staffRows.filter((s) => s.campusId === where.campusId && (!where.role?.in || where.role.in.includes(s.role)) && (typeof where.role !== "string" || s.role === where.role)) },
  payrollRun: { findUnique: async () => null },
  leaveRequest: {
    findMany: async ({ where }: { where: Row }) => {
      leaveQueries.push({ model: "leaveRequest", where });
      return leaveRequests.filter((r) =>
        (where.schoolId === undefined || r.schoolId === where.schoolId) && r.campusId === where.campusId && inList(r.userId, where.userId)
        && r.status === where.status && r.fromDate < where.fromDate.lt && r.toDate >= where.toDate.gte);
    },
  },
  leaveAllocation: {
    findMany: async ({ where }: { where: Row }) => {
      leaveQueries.push({ model: "leaveAllocation", where });
      return leaveAllocations.filter((a) =>
        (where.schoolId === undefined || a.schoolId === where.schoolId) && a.campusId === where.campusId && a.academicYear === where.academicYear
        && (where.OR as Row[]).some((o) => (o.userId === null ? a.userId === null && inList(a.role, o.role) : inList(a.userId, o.userId))));
    },
  },
  $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn({
    payrollRun: { create: async ({ data }: { data: Row }) => ({ id: "run-1", status: data.status, lines: data.lines.create }) },
  }),
};

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
let current: User | null = null;
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => null } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    assertPermission: async () => {},
    canManageCampusOps: (user: User) => ["PRINCIPAL", "ADMIN", "CAMPUS_ADMIN"].includes(user.role),
    requireAuthUser: async () => { if (!current) throw new ApiError("Unauthorized", 401); return current; },
    resolveCampusId: async (user: User) => user.campusId,
    errorResponse: (error: unknown) => Response.json({ success: false, error: (error as Error).message }, { status: (error as ApiError).status ?? 500 }),
  },
});

const staff = (id: string, role: string, basicSalary: number, campusId = "campus-a1") =>
  ({ id, fullName: id, role, campusId, joiningDate: null, staffProfile: { basicSalary, allowancesJson: {}, deductionsJson: {} } });

const generate = async (user: User | null) => {
  current = user;
  leaveQueries.length = 0;
  const { POST } = await import("../../src/app/api/payroll/generate/route");
  const req = new Request("http://localhost/api/payroll/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month: 3, year: 2026 }) });
  const res = await POST(req as any);
  return { status: res.status, body: await res.json() };
};
const principalA: User = { userId: "u-head", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1" };

test("unpaid leave deductions match the per-user rule and ignore other schools, campuses, months and years", async () => {
  staffRows = [staff("t1", "TEACHER", 30000), staff("t2", "TEACHER", 30000), staff("p1", "PRINCIPAL", 60000), staff("x1", "TEACHER", 30000, "campus-a2")];
  const r = await generate(principalA);
  assert.equal(r.status, 200);
  const byUser = new Map((r.body.data.lines as Row[]).map((l) => [l.userId, l]));
  assert.deepEqual([...byUser.keys()].sort(), ["p1", "t1", "t2"]);
  // t1: 4 days approved, 2 allocated to teachers -> 2 unpaid days of 30000/30
  assert.equal(byUser.get("t1")!.net, 28000);
  assert.equal(byUser.get("t1")!.breakdownJson.unpaidLeaveDays, 2);
  // t2: the per-user allocation (5 days) beats the role-wide one (2 days) -> nothing unpaid
  assert.equal(byUser.get("t2")!.net, 30000);
  assert.equal(byUser.get("t2")!.breakdownJson.leaveDeduction, undefined);
  // p1: no principal allocation this academic year on this campus and school -> 3 unpaid days of 60000/30
  assert.equal(byUser.get("p1")!.net, 54000);
});

test("leave is loaded in two school- and campus-scoped queries however many staff there are", async () => {
  staffRows = Array.from({ length: 120 }, (_, i) => staff(`bulk-${i}`, i % 2 ? "TEACHER" : "PRINCIPAL", 30000));
  const r = await generate(principalA);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.lines.length, 120);
  assert.deepEqual(leaveQueries.map((q) => q.model).sort(), ["leaveAllocation", "leaveRequest"]);
  for (const q of leaveQueries) {
    assert.equal(q.where.schoolId, "school-a");
    assert.equal(q.where.campusId, "campus-a1");
  }
  const request = leaveQueries.find((q) => q.model === "leaveRequest")!.where;
  assert.equal(request.userId.in.length, 120);
  assert.deepEqual(request.fromDate, { lt: MARCH_END });
  assert.deepEqual(request.toDate, { gte: MARCH_START });
});

test("a second school's run only reads that school's leave", async () => {
  staffRows = [staff("t1", "TEACHER", 30000)];
  const r = await generate({ userId: "u-head-b", role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-a1" });
  assert.equal(r.status, 200);
  // school-b's teacher allocation (30 days) covers school-b's 9-day request; school-a rows are never read
  assert.equal(r.body.data.lines[0].net, 30000);
  assert.ok(leaveQueries.every((q) => q.where.schoolId === "school-b"));
});

test("a role that cannot manage campus operations is refused before any leave is read", async () => {
  staffRows = [staff("t1", "TEACHER", 30000)];
  const r = await generate({ userId: "u-teacher", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" });
  assert.equal(r.status, 403);
  assert.equal(leaveQueries.length, 0);
});

test("an empty staff list makes no leave queries", async () => {
  staffRows = [];
  const r = await generate(principalA);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.lines.length, 0);
  assert.equal(leaveQueries.length, 0);
});

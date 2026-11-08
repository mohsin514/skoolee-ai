import assert from "node:assert/strict";
import { mock, test } from "node:test";

// Two schools, two campuses in school A. Campus -> school map backs the `campus: { schoolId }` relation filter.
const campusSchool: Record<string, string> = { "campus-a": "school-a", "campus-b": "school-a", "campus-x": "school-b" };
const discounts = [
  { id: "disc-a", campusId: "campus-a" },
  { id: "disc-b", campusId: "campus-b" },
  { id: "disc-x", campusId: "campus-x" },
];
const students = [
  { id: "stu-a", campusId: "campus-a" },
  { id: "stu-b", campusId: "campus-b" },
  { id: "stu-x", campusId: "campus-x" },
];
let created: Array<{ discountId: string; studentId: string }> = [];

type Where = { id: string; campusId?: string; campus: { schoolId: string } };
const match = (rows: Array<{ id: string; campusId: string }>) => async ({ where }: { where: Where }) =>
  rows.find((r) => r.id === where.id && (!where.campusId || r.campusId === where.campusId) && campusSchool[r.campusId] === where.campus.schoolId) ?? null;

const fakeTx = {
  feeDiscountAssignment: {
    create: async ({ data }: { data: { discountId: string; studentId: string } }) => { created.push(data); return { id: `as-${created.length}`, ...data }; },
  },
};
const fakePrisma = {
  feeDiscount: { findFirst: match(discounts) },
  student: { findFirst: match(students) },
  feeDiscountAssignment: { findUnique: async () => null },
  $transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx),
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });
mock.module("@/lib/api/scope", {
  namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } },
});

const load = () => import("@/lib/fees/assign-discount-command");
const accountant = (campusId: string | null = "campus-a", schoolId = "school-a") =>
  ({ userId: "acc-1", role: "ACCOUNTANT", schoolId, campusId, institutionKind: "GROUP" }) as never;
const superAdmin = (schoolId = "school-a") =>
  ({ userId: "sa-1", role: "SUPER_ADMIN", schoolId, campusId: null, institutionKind: "GROUP" }) as never;
const status = (code: number) => (e: { status?: number }) => e.status === code;

test("campus accountant assigns a same-campus discount", async () => {
  created = [];
  const { assignDiscount } = await load();
  await assignDiscount(accountant(), { discountId: "disc-a", studentId: "stu-a" });
  assert.equal(created.length, 1);
});

test("campus accountant cannot assign to a student on another campus", async () => {
  created = [];
  const { assignDiscount } = await load();
  await assert.rejects(assignDiscount(accountant(), { discountId: "disc-b", studentId: "stu-b" }), status(404));
  await assert.rejects(assignDiscount(accountant(), { discountId: "disc-a", studentId: "stu-b" }), status(404));
  assert.equal(created.length, 0);
});

test("non-institution user with no campus is denied", async () => {
  created = [];
  const { assignDiscount } = await load();
  await assert.rejects(assignDiscount(accountant(null), { discountId: "disc-a", studentId: "stu-a" }), status(404));
  assert.equal(created.length, 0);
});

test("institution super admin may assign on any campus, but not across campuses", async () => {
  created = [];
  const { assignDiscount } = await load();
  await assignDiscount(superAdmin(), { discountId: "disc-b", studentId: "stu-b" });
  assert.equal(created.length, 1);
  await assert.rejects(assignDiscount(superAdmin(), { discountId: "disc-a", studentId: "stu-b" }), status(409));
  assert.equal(created.length, 1);
});

test("school isolation holds for every role", async () => {
  created = [];
  const { assignDiscount } = await load();
  await assert.rejects(assignDiscount(superAdmin(), { discountId: "disc-x", studentId: "stu-x" }), status(404));
  await assert.rejects(assignDiscount(accountant("campus-x", "school-a"), { discountId: "disc-x", studentId: "stu-x" }), status(404));
  assert.equal(created.length, 0);
});

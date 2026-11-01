import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Employee = { schoolId: string; campusId: string; userId: string; providerIds: Record<string, string>; leavingDate: Date | null };
const store = new Map<string, Employee>();
const staff = new Set(["staff-a|campus-a", "staff-b|campus-b"]);
const key = (schoolId: string, userId: string) => `${schoolId}:${userId}`;

const fakePrisma = {
  user: {
    findFirst: async ({ where }: { where: { id: string; campusId: string } }) =>
      staff.has(`${where.id}|${where.campusId}`) ? { id: where.id } : null,
  },
  payrollEmployee: {
    findUnique: async ({ where }: { where: { schoolId_userId: { schoolId: string; userId: string } } }) =>
      store.get(key(where.schoolId_userId.schoolId, where.schoolId_userId.userId)) ?? null,
    upsert: async (args: { where: { schoolId_userId: { schoolId: string; userId: string } }; create: Employee; update: Partial<Employee> }) => {
      const k = key(args.where.schoolId_userId.schoolId, args.where.schoolId_userId.userId);
      const next = { ...(store.get(k) ?? args.create), ...args.update } as Employee;
      store.set(k, next);
      return next;
    },
  },
  payrollCalculation: { findMany: async () => [] },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    assertPermission: async () => {},
  },
});

const loadService = () => import("@/lib/payroll-runs/service");
const user = (campusId = "campus-a") => ({ userId: "acc-1", role: "ACCOUNTANT", schoolId: "school-a", campusId }) as never;

test("disjoint provider keys from separate saves are both kept", async () => {
  store.clear();
  await (await loadService()).setEmployee(user(), "staff-a", { providerIds: { WPS: "WPS-101" } });
  await (await loadService()).setEmployee(user(), "staff-a", { providerIds: { BANK: "BANK-101" } });
  assert.deepEqual(store.get(key("school-a", "staff-a"))?.providerIds, { WPS: "WPS-101", BANK: "BANK-101" });
});

test("saving provider ids does not overwrite an existing leaving date", async () => {
  store.clear();
  await (await loadService()).setEmployee(user(), "staff-a", { leavingDate: "2026-06-30" });
  await (await loadService()).setEmployee(user(), "staff-a", { providerIds: { WPS: "WPS-101" } });
  assert.equal(store.get(key("school-a", "staff-a"))?.leavingDate?.toISOString().slice(0, 10), "2026-06-30");
});

test("a staff member from another campus is rejected", async () => {
  store.clear();
  await assert.rejects(async () => (await loadService()).setEmployee(user("campus-a"), "staff-b", { providerIds: { WPS: "WPS-9" } }), /Staff member not found/);
});

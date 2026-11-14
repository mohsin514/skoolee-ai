import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-804: creating a meeting window must run inside the school's tenant transaction.
// A bare prisma.$transaction has no tenant context and the fail-closed guard rejects it.
const calls: Array<{ schoolId: string; userId: string }> = [];
let directTransactionUsed = false;
let windows: Array<Record<string, unknown>> = [];

const tx = {
  $queryRaw: async () => [],
  meetingWindow: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      windows.find((w) => w.schoolId === where.schoolId && w.teacherId === where.teacherId && w.localDate === where.localDate) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `mw-${windows.length + 1}`, status: "OPEN", ...data };
      windows.push(row);
      return row;
    },
  },
};

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      $transaction: async () => {
        directTransactionUsed = true;
        throw new Error("no tenant context");
      },
    },
  },
});
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: () => false } });
mock.module("@/lib/datetime", { namedExports: { calendarDateIn: () => "2026-01-01" } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ timezone: "Asia/Karachi" }) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => true } });
mock.module("@/lib/school-ai/transaction", {
  namedExports: {
    schoolAiTransaction: async (user: { schoolId: string; userId: string }, fn: (t: unknown) => Promise<unknown>) => {
      calls.push({ schoolId: user.schoolId, userId: user.userId });
      return fn(tx);
    },
  },
});

const loadService = () => import("@/lib/meetings/service");
const teacher = (userId: string, schoolId: string) => ({ userId, role: "TEACHER", schoolId, campusId: `${schoolId}-campus` }) as never;
const body = (over: Record<string, unknown> = {}) => ({ localDate: "2026-06-10", startTime: "09:00", endTime: "10:00", slotMinutes: 15, location: "Room 4", cancellationPolicy: "Tell us 24 hours ahead.", mode: "IN_PERSON", ...over });

test("a teacher's window is created inside the school's tenant transaction, not a bare transaction", async () => {
  windows = []; calls.length = 0; directTransactionUsed = false;
  const { createWindow } = await loadService();
  const row = await createWindow(teacher("t-qa-alpha", "school-alpha"), body());
  assert.equal(row.schoolId, "school-alpha");
  assert.deepEqual(calls, [{ schoolId: "school-alpha", userId: "t-qa-alpha" }]);
  assert.equal(directTransactionUsed, false);
});

test("two schools each get their own window and never see the other's", async () => {
  windows = []; calls.length = 0;
  const { createWindow } = await loadService();
  const a = await createWindow(teacher("t-alpha", "school-alpha"), body());
  const b = await createWindow(teacher("t-beta", "school-beta"), body());
  assert.equal(a.schoolId, "school-alpha");
  assert.equal(b.schoolId, "school-beta");
  assert.equal(windows.length, 2);
  assert.deepEqual(calls.map((c) => c.schoolId), ["school-alpha", "school-beta"]);
});

test("a denied role cannot create a window and no transaction is opened", async () => {
  windows = []; calls.length = 0;
  const { createWindow } = await loadService();
  const parent = { userId: "p-1", role: "PARENT", schoolId: "school-alpha", campusId: "school-alpha-campus" } as never;
  await assert.rejects(createWindow(parent, body()), (err: { status?: number }) => err.status === 403);
  assert.equal(calls.length, 0);
  assert.equal(windows.length, 0);
});

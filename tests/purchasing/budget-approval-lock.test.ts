import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { setImmediate as tick } from "node:timers/promises";

// SKAI-1514: concurrent approvals serialize their capacity claim per budget, so committed never exceeds the amount.
type Row = Record<string, any>;
let requests: Row[] = [];
const budgets: Record<string, Row> = {
  "b-a": { id: "b-a", amount: 100, approvalLimit: 10_000, currency: "PKR" },
  "b-a2": { id: "b-a2", amount: 100, approvalLimit: 10_000, currency: "PKR" },
  "b-b": { id: "b-b", amount: 100, approvalLimit: 10_000, currency: "SAR" },
};
const req = (id: string, schoolId: string, campusId: string, budgetId: string, total: number): Row =>
  ({ id, schoolId, campusId, budgetId, status: "SUBMITTED", version: 2, total, lines: [], supplierId: null, received: [0], history: [], requestedById: "maker" });

// Advisory lock emulation: a key is held until its transaction finishes.
const held = new Map<string, Promise<void>>();
const lockKeys: string[] = [];
function txClient(release: (() => void)[]): Row {
  return {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      lockKeys.push(key);
      while (held.has(key)) await held.get(key);
      let done!: () => void;
      held.set(key, new Promise<void>(r => { done = r; }));
      release.push(() => { held.delete(key); done(); });
      return 0;
    },
    purchaseRequest: {
      findFirst: async ({ where }: Row) => { const r = requests.find(x => x.id === where.id && x.schoolId === where.schoolId); return r ? { ...r } : null; },
      findUnique: async ({ where }: Row) => requests.find(r => r.id === where.id) ?? null,
      findMany: async ({ where }: Row) => { await tick(); await tick(); return requests.filter(r => r.budgetId === where.budgetId && where.status.in.includes(r.status)).map(r => ({ ...r })); },
      updateMany: async ({ where, data }: Row) => {
        const r = requests.find(x => x.id === where.id && x.version === where.version);
        if (!r) return { count: 0 };
        Object.assign(r, { ...data, version: r.version + 1 });
        return { count: 1 };
      },
    },
    purchaseBudget: {
      findUnique: async ({ where }: Row) => budgets[where.id] ?? null,
      findUniqueOrThrow: async ({ where }: Row) => budgets[where.id],
    },
    auditLog: { create: async () => ({}) },
  };
}
const prisma: Row = {
  $transaction: async (fn: (tx: unknown) => unknown) => {
    const release: (() => void)[] = [];
    try { return await fn(txClient(release)); } finally { release.forEach(r => r()); }
  },
};
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, soleChecker: async () => false } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: (u: Row) => u.role === "CAMPUS_ADMIN" } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => undefined } });
const decide = async (user: Row, id: string, version = 2) =>
  (await import("../../src/lib/purchasing/service")).decideRequest(user as never, id, { version, decision: "APPROVE" });

const adminA = { userId: "admin-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
const adminA2 = { userId: "admin-a2", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a2" };
const adminB = { userId: "admin-b", role: "CAMPUS_ADMIN", schoolId: "school-b", campusId: "campus-b" };
const committed = (budgetId: string) => requests.filter(r => r.budgetId === budgetId && r.status === "APPROVED").reduce((s, r) => s + r.total, 0);
beforeEach(() => { held.clear(); lockKeys.length = 0; });

test("two concurrent PKR 60 approvals against PKR 100: one succeeds, one gets 409", async () => {
  requests = [req("pr-1", "school-a", "campus-a", "b-a", 60), req("pr-2", "school-a", "campus-a", "b-a", 60)];
  const results = await Promise.allSettled([decide(adminA, "pr-1"), decide(adminA, "pr-2")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  assert.match(rejected.reason.message, /20 PKR above available budget/);
  assert.equal(committed("b-a"), 60);
  assert.ok(lockKeys.every(k => k === "purchase-budget:b-a"));
});

test("exact capacity is accepted and the next unit is refused", async () => {
  requests = [req("pr-1", "school-a", "campus-a", "b-a", 40), req("pr-2", "school-a", "campus-a", "b-a", 60), req("pr-3", "school-a", "campus-a", "b-a", 1)];
  await Promise.all([decide(adminA, "pr-1"), decide(adminA, "pr-2")]);
  assert.equal(committed("b-a"), 100);
  await assert.rejects(decide(adminA, "pr-3"), (e: ApiError) => e.status === 409);
  assert.equal(committed("b-a"), 100);
});

test("a retry of a refused approval after a sibling is cancelled succeeds; a stale retry gets 409", async () => {
  requests = [req("pr-1", "school-a", "campus-a", "b-a", 60), req("pr-2", "school-a", "campus-a", "b-a", 60)];
  await decide(adminA, "pr-1");
  await assert.rejects(decide(adminA, "pr-2"), (e: ApiError) => e.status === 409);
  await assert.rejects(decide(adminA, "pr-1"), (e: ApiError) => e.status === 409);
  requests[0].status = "CANCELLED";
  await decide(adminA, "pr-2");
  assert.equal(committed("b-a"), 60);
});

test("other budgets, campuses and schools are unaffected and do not share a lock", async () => {
  requests = [req("pr-1", "school-a", "campus-a", "b-a", 60), req("pr-2", "school-a", "campus-a2", "b-a2", 60), req("pr-3", "school-b", "campus-b", "b-b", 60)];
  await Promise.all([decide(adminA, "pr-1"), decide(adminA2, "pr-2"), decide(adminB, "pr-3")]);
  assert.deepEqual([committed("b-a"), committed("b-a2"), committed("b-b")], [60, 60, 60]);
  assert.deepEqual(new Set(lockKeys), new Set(["purchase-budget:b-a", "purchase-budget:b-a2", "purchase-budget:b-b"]));
});

test("a cross-school or teacher approval is denied before any lock is taken", async () => {
  requests = [req("pr-1", "school-a", "campus-a", "b-a", 60)];
  await assert.rejects(decide(adminB, "pr-1"), (e: ApiError) => e.status === 404);
  await assert.rejects(decide({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" }, "pr-1"), (e: ApiError) => e.status === 403);
  assert.equal(lockKeys.length, 0);
  assert.equal(committed("b-a"), 0);
});

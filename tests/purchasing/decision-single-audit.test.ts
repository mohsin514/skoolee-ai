import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { auditedOperation, resetAuditTrailState } from "../../src/lib/db/audit-trail";
import { getTenantContext, runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1773: one purchase decision writes exactly one audit row; a self-approval's row keeps actor, reason,
// status, campus and the selfApproved flag.
type Row = Record<string, any>;
const audits: Row[] = [];
let requests: Row[] = [];
const seed = (): Row[] => [
  { id: "pr-a", schoolId: "school-a", campusId: "campus-a", budgetId: "b-a", status: "SUBMITTED", version: 2, total: 100, lines: [], supplierId: null, received: [0], history: [], requestedById: "admin-a" },
  { id: "pr-b", schoolId: "school-b", campusId: "campus-b", budgetId: "b-b", status: "SUBMITTED", version: 2, total: 100, lines: [], supplierId: null, received: [0], history: [], requestedById: "admin-b" },
];
const base: Row = {
  auditLog: { create: async ({ data }: Row) => { const row = { id: `audit-${audits.length + 1}`, schoolId: getTenantContext()?.schoolId, ...data }; audits.push(row); return row; } },
  purchaseRequest: {
    findFirst: async ({ where }: Row) => { const r = requests.find(x => x.id === where.id && x.schoolId === where.schoolId); return r ? { ...r } : null; },
    findUnique: async ({ where }: Row) => requests.find(r => r.id === where.id) ?? null,
    findMany: async () => [],
    updateMany: async ({ where, data }: Row) => {
      const r = requests.find(x => x.id === where.id && x.version === where.version);
      if (!r) return { count: 0 };
      Object.assign(r, { ...data, version: r.version + 1 });
      return { count: 1 };
    },
  },
  purchaseBudget: {
    findUnique: async () => ({ amount: 10_000, approvalLimit: 10_000, currency: "SAR" }),
    findUniqueOrThrow: async () => ({ amount: 10_000, approvalLimit: 10_000, currency: "SAR" }),
  },
};
const audited = (delegate: string, operation: string) => (args: unknown) =>
  auditedOperation({ delegate, operation, args, query: base[delegate][operation], client: base as never });
const prisma: Row = {
  ...base,
  purchaseRequest: { ...base.purchaseRequest, updateMany: audited("purchaseRequest", "updateMany") },
  auditLog: { create: audited("auditLog", "create") },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
};
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
let sole = true;
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, soleChecker: async () => sole } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: (u: Row) => u.role === "CAMPUS_ADMIN" } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => undefined } });
const decide = async (user: Row, id: string, input: Row) =>
  runWithTenantContext({ schoolId: user.schoolId, userId: user.userId }, async () =>
    (await import("../../src/lib/purchasing/service")).decideRequest(user as never, id, input));

const adminA = { userId: "admin-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
const checkerA = { userId: "checker-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
const reason = "Only administrator on this campus this term";
beforeEach(() => { audits.length = 0; requests = seed(); sole = true; resetAuditTrailState(); });

test("a sole-checker self-approval writes exactly one audit row with actor, reason, status, campus and flag", async () => {
  await decide(adminA, "pr-a", { version: 2, decision: "APPROVE", reason });
  assert.equal(requests[0].status, "APPROVED");
  assert.equal(audits.length, 1);
  const [row] = audits;
  assert.deepEqual([row.tableName, row.recordId, row.userId, row.schoolId, row.campusId], ["purchase_requests", "pr-a", "admin-a", "school-a", "campus-a"]);
  assert.deepEqual(row.oldValue, { status: "SUBMITTED" });
  assert.deepEqual(row.newValue, { status: "APPROVED", selfApproved: true, reason });
});

test("a separate checker's approval writes exactly one audit row", async () => {
  await decide(checkerA, "pr-a", { version: 2, decision: "APPROVE" });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].userId, "checker-a");
  assert.equal(audits[0].newValue.selfApproved, undefined);
});

test("stale, refused and cross-school decisions write no audit row", async () => {
  await assert.rejects(decide(adminA, "pr-a", { version: 1, decision: "APPROVE", reason }), (e: ApiError) => e.status === 409);
  sole = false;
  await assert.rejects(decide(adminA, "pr-a", { version: 2, decision: "APPROVE", reason }), (e: ApiError) => e.status === 403);
  const teacher = { userId: "t-a", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  await assert.rejects(decide(teacher, "pr-a", { version: 2, decision: "APPROVE" }), (e: ApiError) => e.status === 403);
  await assert.rejects(decide(adminA, "pr-b", { version: 2, decision: "APPROVE", reason }), (e: ApiError) => e.status === 404);
  assert.equal(audits.length, 0);
  assert.deepEqual(requests.map(r => r.status), ["SUBMITTED", "SUBMITTED"]);
});

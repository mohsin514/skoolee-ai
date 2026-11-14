import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1860: the purchasing overview reads every budget's committed orders once and folds them per budget, so its
// query count no longer grows with the number of budgets. Positions match budgetPosition; scope stays school + campus.
type Row = Record<string, any>;
let budgets: Row[] = [], requests: Row[] = [], calls: Row[] = [];
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? ("in" in v ? v.in.includes(row[k]) : "notIn" in v ? !v.notIn.includes(row[k]) : true)
    : row[k] === v);
const model = (name: string, rows: () => Row[]) => ({
  findMany: async (args: Row = {}) => { calls.push({ name, op: "findMany", where: args.where }); return rows().filter(r => matches(r, args.where)); },
  findUnique: async ({ where }: Row) => { calls.push({ name, op: "findUnique", where }); return rows().find(r => r.id === where.id) ?? null; },
});
// SKAI-1970: the overview's per-budget committed/spent aggregate. Applies the SQL's school, budget and status filters
// and sums unitPrice × received per line in BigInt, as Postgres returns it.
const aggregate = async (sql: { sql: string; values: string[] }) => {
  const [schoolId, ...rest] = sql.values, statuses = rest.slice(-3), budgetIds = rest.slice(0, -3);
  calls.push({ name: "purchaseRequest", op: "$queryRaw", schoolId, budgetIds, statuses, sql: sql.sql });
  const out = new Map<string, { budgetId: string; committed: bigint; spent: bigint }>();
  for (const r of requests.filter(r => r.schoolId === schoolId && budgetIds.includes(r.budgetId) && statuses.includes(r.status))) {
    const row = out.get(r.budgetId) ?? { budgetId: r.budgetId, committed: BigInt(0), spent: BigInt(0) };
    row.committed += BigInt(r.total);
    r.lines.forEach((l: Row, i: number) => { row.spent += BigInt(l.unitPrice) * BigInt(r.received[i] ?? 0); });
    out.set(r.budgetId, row);
  }
  return [...out.values()];
};
const prisma = {
  $queryRaw: aggregate,
  purchaseBudget: model("purchaseBudget", () => budgets),
  purchaseRequest: model("purchaseRequest", () => requests),
  schoolAsset: model("schoolAsset", () => []),
  supplierInvoice: model("supplierInvoice", () => []),
  assetService: model("assetService", () => []),
  itemStore: model("itemStore", () => []),
  item: model("item", () => []),
  supplier: model("supplier", () => []),
};
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, soleChecker: async () => false } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: (u: Row) => u.role === "CAMPUS_ADMIN" } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => undefined } });
const svc = () => import("@/lib/purchasing/service");
const admin = (s: string, campus = `campus-${s}`, role = "CAMPUS_ADMIN") => ({ userId: `u-${s}`, role, schoolId: `school-${s}`, campusId: campus }) as never;

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "REJECTED"];
function seed(perCampus: number) {
  budgets = []; requests = []; calls = [];
  for (const [school, campus] of [["a", "campus-a"], ["a", "campus-a2"], ["b", "campus-b"]]) {
    for (let i = 0; i < perCampus; i++) {
      const id = `${campus}-b${i}`;
      budgets.push({ id, schoolId: `school-${school}`, campusId: campus, costCenter: `CC${i % 4}`, period: `202${i % 3}`, amount: 50_000 + i, approvalLimit: 1000, currency: "SAR" });
      STATUSES.forEach((status, j) => requests.push({ id: `${id}-r${j}`, schoolId: `school-${school}`, campusId: campus, budgetId: id, status, total: 100 * (j + 1) + i, lines: [{ description: "x", quantity: 4, unitPrice: 10 + j }, { description: "y", quantity: 2, unitPrice: 7 }], received: [j, 1], history: [], createdAt: new Date(Date.UTC(2026, 0, 1, 0, j)) }));
    }
  }
}

for (const perCampus of [2, 25]) {
  test(`SKAI-1860: ${perCampus} budgets per campus cost a fixed number of queries and match budgetPosition`, async () => {
    seed(perCampus);
    const { purchasingOverview, budgetPosition } = await svc();
    const overview = await purchasingOverview(admin("a"));
    assert.equal(calls.filter(c => c.name === "purchaseBudget" && c.op === "findUnique").length, 0);
    assert.equal(calls.filter(c => c.name === "purchaseRequest").length, 3, "committed aggregate + open + first closed page");
    assert.equal(calls.filter(c => c.name === "purchaseRequest" && c.op === "findMany" && c.where?.budgetId).length, 0, "no committed order rows are shipped to Node");
    assert.deepEqual(overview.budgets.map((b: Row) => b.id), budgets.filter(b => b.campusId === "campus-a").map(b => b.id));
    for (const b of overview.budgets) {
      const expected = await budgetPosition(prisma as never, b.id);
      assert.deepEqual({ committed: b.committed, spent: b.spent, available: b.available }, { committed: expected.committed, spent: expected.spent, available: expected.available });
    }
    const committedRead = calls.find(c => c.op === "$queryRaw");
    assert.equal(committedRead!.schoolId, "school-a");
    assert.match(committedRead!.sql, /pr\.school_id = \?/);
    assert.deepEqual(committedRead!.statuses, ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"]);
  });
}

test("SKAI-1860: another campus and another school see only their own budgets and totals; a guardian is refused", async () => {
  seed(3);
  const { purchasingOverview } = await svc();
  const a2 = await purchasingOverview(admin("a", "campus-a2"));
  const b = await purchasingOverview(admin("b"));
  assert.ok(a2.budgets.every((x: Row) => x.campusId === "campus-a2" && x.schoolId === "school-a"));
  assert.ok(b.budgets.every((x: Row) => x.campusId === "campus-b" && x.schoolId === "school-b"));
  // Committed = APPROVED + PARTIALLY_RECEIVED + RECEIVED totals only (300 + 400 + 500 + 3 × index).
  assert.deepEqual(b.budgets.map((x: Row) => x.committed), [1200, 1203, 1206]);
  await assert.rejects(purchasingOverview(admin("a", "campus-a", "PARENT")), /Only school staff/);
});

test("SKAI-1970: partial receipts, a return to supplier and an empty received array match budgetPosition", async () => {
  seed(1);
  const id = "campus-a-b0";
  requests = requests.filter(r => r.budgetId !== id);
  const line = (unitPrice: number) => ({ description: "x", quantity: 5, unitPrice });
  requests.push(
    { id: "partial", schoolId: "school-a", campusId: "campus-a", budgetId: id, status: "PARTIALLY_RECEIVED", total: 75, lines: [line(10), line(5)], received: [2], history: [], createdAt: new Date() },
    { id: "returned", schoolId: "school-a", campusId: "campus-a", budgetId: id, status: "PARTIALLY_RECEIVED", total: 40, lines: [line(8)], received: [0], history: [], createdAt: new Date() },
    { id: "approved", schoolId: "school-a", campusId: "campus-a", budgetId: id, status: "APPROVED", total: 30, lines: [line(6)], received: [], history: [], createdAt: new Date() },
    { id: "received", schoolId: "school-a", campusId: "campus-a", budgetId: id, status: "RECEIVED", total: 50, lines: [line(4), line(6)], received: [5, 5], history: [], createdAt: new Date() },
  );
  const { purchasingOverview, budgetPosition } = await svc();
  const [b] = (await purchasingOverview(admin("a"))).budgets;
  const expected = await budgetPosition(prisma as never, id);
  assert.deepEqual({ committed: b.committed, spent: b.spent, available: b.available }, { committed: expected.committed, spent: expected.spent, available: expected.available });
  assert.deepEqual([b.committed, b.spent], [195, 70]);
});

test("SKAI-1860: a campus with no budgets skips the committed-orders read", async () => {
  seed(0);
  const overview = await (await svc()).purchasingOverview(admin("a"));
  assert.deepEqual(overview.budgets, []);
  assert.equal(calls.filter(c => c.name === "purchaseRequest").length, 2);
});

import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { auditedOperation, resetAuditTrailState } from "../../src/lib/db/audit-trail";
import { getTenantContext, runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1770: one campus profile save writes exactly one audit row (the DETAILS row with changed fields only).
type Row = Record<string, any>;
const audits: Row[] = [];
const seed = (): Row[] => [
  { id: "campus-a1", schoolId: "school-a", name: "Synthetic North", city: "Riyadh", archivedAt: null },
  { id: "campus-a2", schoolId: "school-a", name: "Synthetic South", city: "Riyadh", archivedAt: null },
  { id: "campus-b1", schoolId: "school-b", name: "Other North", city: "Jeddah", archivedAt: null },
];
let campuses = seed();
const base: Row = {
  auditLog: { create: async ({ data }: Row) => { const row = { id: `audit-${audits.length + 1}`, schoolId: getTenantContext()?.schoolId, ...data }; audits.push(row); return row; } },
  campus: {
    findUnique: async ({ where }: Row) => campuses.find(c => c.id === where.id) ?? null,
    findFirst: async ({ where }: Row) => campuses.find(c => (typeof where.id === "string" ? c.id === where.id : c.id !== where.id?.not) && c.schoolId === where.schoolId && (!where.name || c.name.toLowerCase() === where.name.equals.toLowerCase())) ?? null,
    update: async ({ where, data }: Row) => { const c = campuses.find(x => x.id === where.id)!; for (const [k, v] of Object.entries(data)) if (v !== undefined) c[k] = v; return { ...c }; },
  },
};
// Mutations go through the real audit-trail extension, as on the guarded client.
const audited = (delegate: string, operation: string) => (args: unknown) =>
  auditedOperation({ delegate, operation, args, query: base[delegate][operation], client: base as never });
const prisma: Row = {
  campus: { ...base.campus, update: audited("campus", "update") },
  auditLog: { create: audited("auditLog", "create") },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanCapacity: async () => undefined } });
mock.module("@/lib/school/country", { namedExports: { schoolCountry: async () => "SA" } });
const update = async (user: Row, input: Row) =>
  runWithTenantContext({ schoolId: user.schoolId, userId: user.userId }, async () =>
    (await import("../../src/lib/school/campus-commands")).updateCampusDetailsCommand(user as never, input as never));

const adminA1 = { userId: "admin-a1", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a1" };
beforeEach(() => { audits.length = 0; campuses = seed(); resetAuditTrailState(); });

test("a campus admin's name change writes exactly one audit row with only the changed field", async () => {
  const result = await update(adminA1, { campusId: "campus-a1", name: "Synthetic North Campus" });
  assert.deepEqual(result.changed, ["name"]);
  assert.equal(audits.length, 1);
  const [row] = audits;
  assert.equal(row.tableName, "campus");
  assert.equal(row.recordId, "campus-a1");
  assert.equal(row.userId, "admin-a1");
  assert.equal(row.schoolId, "school-a");
  assert.deepEqual(row.oldValue, { kind: "DETAILS", fields: { name: "Synthetic North" } });
  assert.deepEqual(row.newValue, { kind: "DETAILS", fields: { name: "Synthetic North Campus" } });
});

test("failed validation writes no audit row", async () => {
  await assert.rejects(update(adminA1, { campusId: "campus-a1", name: "  " }));
  await assert.rejects(update(adminA1, { campusId: "campus-a1", name: "Synthetic South" }), /already uses this name/);
  assert.equal(audits.length, 0);
});

test("two campuses and two schools stay isolated; a denied role is refused", async () => {
  await assert.rejects(update(adminA1, { campusId: "campus-a2", name: "Taken over" }), /only edit the campus you administer/);
  await assert.rejects(update(adminA1, { campusId: "campus-b1", name: "Taken over" }), /Campus not found/);
  const teacher = { userId: "t-a1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" };
  await assert.rejects(update(teacher, { campusId: "campus-a1", name: "Teacher rename" }), /only edit the campus you administer/);
  assert.equal(audits.length, 0);
  assert.deepEqual(campuses.map(c => c.name), ["Synthetic North", "Synthetic South", "Other North"]);
});

// Real Prisma delegates return a lazy PrismaPromise: the query (and the audit extension) only runs when it is
// awaited, which happened outside withoutAutoAudit's scope, so lane-d still saw two rows per save.
test("a lazy (Prisma-style) update still writes exactly one audit row", async () => {
  const eager = prisma.campus.update;
  prisma.campus.update = (args: unknown) => ({ then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => eager(args).then(ok, ko) });
  try {
    await update(adminA1, { campusId: "campus-a1", name: "Synthetic North Campus" });
    assert.deepEqual(audits.map(a => a.tableName), ["campus"]);
  } finally { prisma.campus.update = eager; }
});

// A second copy of audit-trail (Next bundles server actions and route handlers separately) must share the
// in-flight store with the copy whose extension the cached Prisma client was built with.
test("the audit in-flight store is one per process", async () => {
  const store = (globalThis as { __skooleeAuditInFlight?: { getStore(): unknown } }).__skooleeAuditInFlight;
  assert.ok(store, "pinned to globalThis");
  const { withoutAutoAudit } = await import("../../src/lib/db/audit-trail");
  assert.equal(await withoutAutoAudit(async () => store!.getStore()), true);
});

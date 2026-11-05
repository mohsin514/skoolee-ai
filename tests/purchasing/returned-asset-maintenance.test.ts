import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1693: a supplier return left the returned asset's scheduled maintenance open, and completing it created
// another scheduled job. Return now cancels open jobs (kept for audit) and only ACTIVE assets complete/schedule.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Row = Record<string, unknown>;
let assets: Row[] = [], services: Row[] = [], requests: Row[] = [], seq = 0;
const match = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { in?: unknown[]; startsWith?: string; gte?: number };
    if (o.in) return o.in.includes(row[k]);
    if (o.startsWith !== undefined) return String(row[k]).startsWith(o.startsWith);
    if (o.gte !== undefined) return Number(row[k]) >= o.gte;
  }
  return row[k] === v;
});
const table = (rows: () => Row[]) => ({
  findFirst: async ({ where }: { where: Row }) => rows().find(r => match(r, where)) ?? null,
  findUnique: async ({ where }: { where: Row }) => rows().find(r => match(r, where)) ?? null,
  findMany: async ({ where }: { where: Row }) => rows().filter(r => match(r, where)),
  create: async ({ data }: { data: Row }) => { const r = { id: `s${++seq}`, status: "SCHEDULED", ...data }; rows().push(r); return r; },
  update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(rows().find(r => match(r, where))!, data),
  updateMany: async ({ where, data }: { where: Row; data: Row }) => {
    const hit = rows().filter(r => match(r, where));
    for (const r of hit) for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === "object" && "increment" in (v as Row) ? Number(r[k]) + 1 : v;
    return { count: hit.length };
  },
});
const db: Row = { schoolAsset: table(() => assets), assetService: table(() => services), purchaseRequest: table(() => requests) };
db.$transaction = async (fn: (tx: Row) => unknown) => fn(db);
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, soleChecker: async () => false } });
mock.module("@/lib/db/audit-trail", { namedExports: { withoutAutoAudit: (f: () => unknown) => f() } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => {} } });

const admin = (schoolId = "school-a", campusId = "campus-a") => ({ userId: "u1", role: "CAMPUS_ADMIN", schoolId, campusId }) as never;
function seed() {
  seq = 0;
  requests = ["a", "b"].map(x => ({ id: `po-${x}`, schoolId: `school-${x}`, campusId: `campus-${x}`, poNumber: `PO-${x}`, version: 1, history: [], received: [1], lines: [{ description: "Projector", quantity: 1, unitPrice: 100, asset: true }] }));
  assets = ["a", "b"].map(x => ({ id: `asset-${x}`, schoolId: `school-${x}`, campusId: `campus-${x}`, requestId: `po-${x}`, tag: `PO-${x}-L1-1`, status: "ACTIVE", history: [], nextServiceOn: new Date("2026-11-12") }));
  services = ["a", "b"].map(x => ({ id: `job-${x}`, schoolId: `school-${x}`, assetId: `asset-${x}`, status: "SCHEDULED", dueOn: new Date("2026-11-12") }));
}
const svc = () => import("../../src/lib/purchasing/service");
const ret = { line: 0, quantity: 1, reason: "Faulty unit", idempotencyKey: "return-0001" };
const complete = { action: "COMPLETE", work: "Cleaned the lens", nextDueOn: "2027-05-12" };

test("returning an asset cancels its open job and clears its next service date", async () => {
  seed();
  const { returnToSupplier, closeService } = await svc();
  await returnToSupplier(admin(), "po-a", ret);
  assert.equal(assets[0].status, "RETURNED");
  assert.equal(assets[0].nextServiceOn, null);
  assert.equal(services[0].status, "CANCELLED");
  await assert.rejects(closeService(admin(), "job-a", complete), (e: ApiError) => e.status === 409);
  assert.equal(services.filter(s => s.assetId === "asset-a" && s.status === "SCHEDULED").length, 0);
});

test("a stale job on a returned asset cannot be completed into a new job", async () => {
  seed();
  assets[0].status = "RETURNED";
  const { closeService, scheduleService } = await svc();
  await assert.rejects(closeService(admin(), "job-a", complete), /no longer active/);
  assert.equal(services.length, 2);
  await assert.rejects(scheduleService(admin(), "asset-a", { dueOn: "2027-01-01" }), (e: ApiError) => e.status === 409);
  const cancelled = await closeService(admin(), "job-a", { action: "CANCEL", reason: "Asset returned" });
  assert.equal(cancelled?.status, "CANCELLED");
});

test("an active asset still completes and schedules the next job", async () => {
  seed();
  const { closeService } = await svc();
  await closeService(admin(), "job-a", complete);
  assert.equal(services[0].status, "DONE");
  assert.equal(services.filter(s => s.assetId === "asset-a" && s.status === "SCHEDULED").length, 1);
  assert.deepEqual(assets[0].nextServiceOn, new Date("2027-05-12T00:00:00Z"));
});

test("school A's return leaves school B's asset and job untouched, and B cannot close A's job", async () => {
  seed();
  const { returnToSupplier, closeService } = await svc();
  await returnToSupplier(admin(), "po-a", ret);
  assert.equal(assets[1].status, "ACTIVE");
  assert.equal(services[1].status, "SCHEDULED");
  await assert.rejects(closeService(admin("school-b", "campus-b"), "job-a", { action: "CANCEL", reason: "Not mine" }), (e: ApiError) => e.status === 409);
});

test("a teacher cannot close or schedule maintenance", async () => {
  seed();
  const { closeService, scheduleService } = await svc();
  const teacher = { userId: "t1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" } as never;
  await assert.rejects(closeService(teacher, "job-a", complete), (e: ApiError) => e.status === 403);
  await assert.rejects(scheduleService(teacher, "asset-a", { dueOn: "2027-01-01" }), (e: ApiError) => e.status === 403);
  assert.equal(services[0].status, "SCHEDULED");
});

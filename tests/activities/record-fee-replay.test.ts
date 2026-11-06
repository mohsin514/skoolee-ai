import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-602: a retried or second-tab fee record (same outcome) changes nothing: no second waiver audit, no version bump.
type Place = { id: string; schoolId: string; activityId: string; studentId: string; status: string; feeStatus: string; invoiceId: string | null; paymentId: string | null; version: number };
const activities = [
  { id: "act-a", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "admin-a", staffIds: [] as string[], status: "PUBLISHED", costAmount: 500, tripId: null },
  { id: "act-b", schoolId: "school-b", campusId: "campus-b1", coordinatorId: "admin-b", staffIds: [] as string[], status: "PUBLISHED", costAmount: 500, tripId: null },
];
let places: Place[] = [];
const audits: unknown[] = [];
const placeModel = {
  findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { const p = places.find(x => x.id === where.id && x.schoolId === where.schoolId); return p ? { ...p, activity: activities.find(a => a.id === p.activityId)! } : null; },
  findMany: async () => [],
  update: async ({ where, data }: { where: { id: string }; data: Partial<Place> & { version?: unknown } }) => { const p = places.find(x => x.id === where.id)!; Object.assign(p, { ...data, version: p.version + 1 }); return p; },
};
const tx = {
  activityPlace: placeModel,
  activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => activities.find(a => a.id === where.id && a.schoolId === where.schoolId) ?? null },
  invoice: { count: async ({ where }: { where: { id: string; schoolId: string } }) => (where.id === "inv-a" && where.schoolId === "school-a" ? 1 : 0) },
  auditLog: { create: async (row: unknown) => { audits.push(row); return row; } },
  $queryRaw: async () => [],
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: tx } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => false } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: unknown) => unknown) => fn(tx) } });

const admin = (s: "a" | "b", campus = `campus-${s}1`) => ({ userId: campus.endsWith("2") ? "admin-a2" : `admin-${s}`, schoolId: `school-${s}`, campusId: campus, role: "CAMPUS_ADMIN" }) as never;
const reset = () => { places = [{ id: "p1", schoolId: "school-a", activityId: "act-a", studentId: "st1", status: "RESERVED", feeStatus: "DUE", invoiceId: null, paymentId: null, version: 1 }]; audits.length = 0; };
const waive = { placeId: "p1", feeStatus: "WAIVED", reason: "Sibling hardship waiver agreed" };

test("a retried waiver records one audit entry and one version bump", async () => {
  const { recordFee } = await import("../../src/lib/activities/service");
  reset();
  await recordFee(admin("a"), waive);
  const retry = await recordFee(admin("a"), waive);
  assert.equal(audits.length, 1);
  assert.equal(places[0].version, 2);
  assert.equal(retry.feeStatus, "WAIVED");
});

test("a retried paid record against the same invoice is a replay", async () => {
  const { recordFee } = await import("../../src/lib/activities/service");
  reset();
  await recordFee(admin("a"), { placeId: "p1", feeStatus: "PAID", invoiceId: "inv-a" });
  await recordFee(admin("a"), { placeId: "p1", feeStatus: "PAID", invoiceId: "inv-a" });
  assert.equal(places[0].version, 2);
});

test("another school, another campus and a parent cannot record the fee", async () => {
  const { recordFee } = await import("../../src/lib/activities/service");
  reset();
  await assert.rejects(recordFee(admin("b"), waive), (e: { status?: number }) => e.status === 404);
  await assert.rejects(recordFee(admin("a", "campus-a2"), waive), (e: { status?: number }) => e.status === 404);
  await assert.rejects(recordFee({ userId: "par", schoolId: "school-a", campusId: "campus-a1", role: "PARENT" } as never, waive), (e: { status?: number }) => e.status === 404);
  assert.equal(audits.length, 0);
  assert.equal(places[0].version, 1);
});

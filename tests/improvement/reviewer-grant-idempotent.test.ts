import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";

// SKAI-1727: a retried grant returns the existing active grant; one revoke ends every active grant for the reviewer.
type Grant = { id: string; schoolId: string; frameworkId: string; userId: string; criterionIds: string[]; expiresAt: Date; revokedAt: Date | null; grantedById: string };
const grants: Grant[] = [];
const audits: string[] = [];
let raceOnCreate = false;
const same = (g: Grant, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
  const cur = (g as Record<string, unknown>)[k];
  if (v && typeof v === "object" && "equals" in v) return JSON.stringify(cur) === JSON.stringify((v as { equals: unknown }).equals);
  if (v instanceof Date) return String(cur) === String(v);
  return cur === v;
});
const evidenceReviewerGrant = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => { const g = grants.find(x => same(x, where)); return g ? { ...g } : null; },
  create: async ({ data }: { data: Omit<Grant, "id" | "revokedAt"> }) => {
    const dup = grants.some(g => g.revokedAt === null && g.schoolId === data.schoolId && g.frameworkId === data.frameworkId && g.userId === data.userId && JSON.stringify(g.criterionIds) === JSON.stringify(data.criterionIds) && String(g.expiresAt) === String(data.expiresAt));
    if (dup) throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    const g = { ...data, id: `g${grants.length + 1}`, revokedAt: null }; grants.push(g); return { ...g };
  },
  updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Grant> }) => { const hit = grants.filter(g => same(g, where)); hit.forEach(g => Object.assign(g, data)); return { count: hit.length }; },
};
const FW = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";
const REVIEWER = "66666666-6666-4666-8666-666666666666";
const db = {
  evidenceReviewerGrant,
  evidenceFramework: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => where.id === FW && where.schoolId === "school-a" ? { id: FW, criteria: [{ id: C1 }, { id: C2 }] } : null },
  user: { count: async ({ where }: { where: { id: string; schoolId: string } }) => where.id === REVIEWER && where.schoolId === "school-a" ? 1 : 0 },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    if (raceOnCreate) { raceOnCreate = false; await evidenceReviewerGrant.create({ data: { schoolId: "school-a", frameworkId: FW, userId: REVIEWER, criterionIds: [C1, C2].sort(), expiresAt: new Date("2099-01-31T23:59:59Z"), grantedById: "other-session" } }); }
    return fn(db);
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_tx: unknown, _u: unknown, e: { action: string }) => { audits.push(e.action); } } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-05" } });

const lead = (schoolId = "school-a") => ({ userId: "lead-1", schoolId, role: "PRINCIPAL", campusId: null }) as never;
const body = { frameworkId: FW, userId: REVIEWER, criterionIds: [C2, C1], expiresAt: "2099-01-31" };
const reset = () => { grants.length = 0; audits.length = 0; raceOnCreate = false; };
const status = (e: unknown) => (e as { status?: number }).status;
const active = () => grants.filter(g => g.revokedAt === null).length;

test("a retried grant returns the same active grant and audits once", async () => {
  reset();
  const { grantReviewer } = await import("../../src/lib/improvement/service");
  const first = await grantReviewer(lead(), body);
  const retry = await grantReviewer(lead(), { ...body, criterionIds: [C1, C2] });
  assert.equal(retry.id, first.id);
  assert.equal(active(), 1);
  assert.deepEqual(audits, ["GRANT"]);
});

test("a concurrent insert that loses the unique race returns the winning grant", async () => {
  reset(); raceOnCreate = true;
  const { grantReviewer } = await import("../../src/lib/improvement/service");
  const out = await grantReviewer(lead(), body);
  assert.equal(out.grantedById, "other-session");
  assert.equal(active(), 1);
});

test("one revoke ends every active grant for that reviewer on the framework", async () => {
  reset();
  grants.push(
    { id: "dup1", schoolId: "school-a", frameworkId: FW, userId: REVIEWER, criterionIds: [C1], expiresAt: new Date("2099-01-31T23:59:59Z"), revokedAt: null, grantedById: "lead-1" },
    { id: "dup2", schoolId: "school-a", frameworkId: FW, userId: REVIEWER, criterionIds: [C1], expiresAt: new Date("2099-01-31T23:59:59Z"), revokedAt: null, grantedById: "lead-1" },
    { id: "other-school", schoolId: "school-b", frameworkId: FW, userId: REVIEWER, criterionIds: [C1], expiresAt: new Date("2099-01-31T23:59:59Z"), revokedAt: null, grantedById: "lead-b" },
  );
  const { revokeReviewer } = await import("../../src/lib/improvement/service");
  const out = await revokeReviewer(lead(), "dup1");
  assert.equal(out.grantsEnded, 2);
  assert.equal(grants.find(g => g.id === "dup2")!.revokedAt instanceof Date, true);
  assert.equal(grants.find(g => g.id === "other-school")!.revokedAt, null, "school B grant untouched");
});

test("two schools are isolated: a school B lead cannot grant on or revoke school A access", async () => {
  reset();
  const { grantReviewer, revokeReviewer } = await import("../../src/lib/improvement/service");
  const g = await grantReviewer(lead(), body);
  await assert.rejects(grantReviewer(lead("school-b"), body), e => status(e) === 404);
  await assert.rejects(revokeReviewer(lead("school-b"), g.id), e => status(e) === 404);
  assert.equal(active(), 1);
});

test("a denied role (teacher) gets 403 on grant and revoke", async () => {
  reset();
  const { grantReviewer, revokeReviewer } = await import("../../src/lib/improvement/service");
  const teacher = { userId: "t1", schoolId: "school-a", role: "TEACHER", campusId: null } as never;
  await assert.rejects(grantReviewer(teacher, body), e => status(e) === 403);
  await assert.rejects(revokeReviewer(teacher, "g1"), e => status(e) === 403);
});

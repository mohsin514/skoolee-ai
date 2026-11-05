import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1726: an evidence review is conditional on the review state it read; a concurrent decision gets 409.
type Item = { id: string; schoolId: string; frameworkId: string; audience: string; criterionIds: string[]; createdById: string; ownerId: string; reviewState: string; reviewedAt: Date | null; reviewedById: string | null; reviewNote: string | null };
const items: Item[] = [];
const audits: { recordId: string; action: string }[] = [];
const match = (i: Item, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
  const cur = (i as Record<string, unknown>)[k];
  return v instanceof Date || cur instanceof Date ? String(cur) === String(v) : cur === v;
});
const evidenceItem = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => { const i = items.find(x => match(x, where)); return i ? { ...i } : null; },
  findFirstOrThrow: async ({ where }: { where: Record<string, unknown> }) => items.find(i => match(i, where))!,
  updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Item> }) => {
    const hit = items.filter(i => match(i, where)); hit.forEach(i => Object.assign(i, data)); return { count: hit.length };
  },
};
const db = {
  evidenceItem,
  confidentialMember: { findFirst: async () => null },
  evidenceReviewerGrant: { findMany: async ({ where }: { where: { schoolId: string; userId: string } }) => where.userId === "reviewer-a" && where.schoolId === "school-a" ? [{ criterionIds: ["c1"] }] : [] },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_tx: unknown, _u: unknown, e: { recordId: string; action: string }) => { audits.push(e); } } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-05" } });

const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";
const lead = (schoolId: string, userId = "lead-1") => ({ userId, schoolId, role: "PRINCIPAL", campusId: null }) as never;
function seed() {
  items.length = 0; audits.length = 0;
  const base = { frameworkId: "fw", audience: "REVIEWER", criterionIds: ["c1"], createdById: "staff-1", ownerId: "staff-1", reviewState: "PENDING", reviewedAt: null, reviewedById: null, reviewNote: null };
  items.push({ ...base, id: ITEM_A, schoolId: "school-a" }, { ...base, id: ITEM_B, schoolId: "school-b" });
}
const status = (e: unknown) => (e as { status?: number }).status;

test("two concurrent decisions: the first is kept and the second gets 409", async () => {
  seed();
  const { reviewEvidence } = await import("../../src/lib/improvement/service");
  const results = await Promise.allSettled([
    reviewEvidence(lead("school-a", "lead-1"), { itemId: ITEM_A, decision: "ACCEPT" }),
    reviewEvidence(lead("school-a", "lead-2"), { itemId: ITEM_A, decision: "REQUEST_MORE", note: "Need the term 2 data" }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(status((results[1] as PromiseRejectedResult).reason), 409);
  assert.equal(items[0].reviewState, "ACCEPTED");
  assert.equal(items[0].reviewedById, "lead-1");
  assert.deepEqual(audits.map(a => a.action), ["APPROVE"]);
});

test("a stale expected review state is refused with 409", async () => {
  seed(); items[0].reviewState = "ACCEPTED"; items[0].reviewedAt = new Date();
  const { reviewEvidence } = await import("../../src/lib/improvement/service");
  await assert.rejects(reviewEvidence(lead("school-a"), { itemId: ITEM_A, decision: "REQUEST_MORE", note: "more please", expectedReviewState: "PENDING" }), e => status(e) === 409);
  assert.equal(items[0].reviewState, "ACCEPTED");
});

test("normal path: a granted reviewer records a decision with one audit", async () => {
  seed();
  const { reviewEvidence } = await import("../../src/lib/improvement/service");
  const out = await reviewEvidence({ userId: "reviewer-a", schoolId: "school-a", role: "TEACHER", campusId: null } as never, { itemId: ITEM_A, decision: "ACCEPT", expectedReviewState: "PENDING" });
  assert.equal(out.reviewState, "ACCEPTED");
  assert.equal(audits.length, 1);
});

test("two schools are isolated: a school A lead cannot review school B evidence", async () => {
  seed();
  const { reviewEvidence } = await import("../../src/lib/improvement/service");
  await assert.rejects(reviewEvidence(lead("school-a"), { itemId: ITEM_B, decision: "ACCEPT" }), e => status(e) === 404);
  assert.equal(items[1].reviewState, "PENDING");
});

test("a denied role (parent) gets 403", async () => {
  seed();
  const { reviewEvidence } = await import("../../src/lib/improvement/service");
  await assert.rejects(reviewEvidence({ userId: "parent-1", schoolId: "school-a", role: "PARENT", campusId: null } as never, { itemId: ITEM_A, decision: "ACCEPT" }), e => status(e) === 403);
  assert.equal(items[0].reviewState, "PENDING");
});

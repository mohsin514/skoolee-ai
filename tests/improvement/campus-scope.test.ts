import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2111: a campus-pinned PRINCIPAL / CAMPUS_ADMIN cannot read or change another campus teacher's improvement records.
type Action = { id: string; schoolId: string; frameworkId: string; ownerId: string; version: number; status: string; milestones: unknown[]; reassessment: unknown; reflection: string | null };
type Item = { id: string; schoolId: string; frameworkId: string; ownerId: string; audience: string; criterionIds: string[]; createdById: string; sourceType: string; sourceId: string | null; sourceVersion: string; sensitivity: string; note: string | null; reviewState: string; reviewedAt: Date | null };
const CAMPUS_1 = "campus-1", CAMPUS_2 = "campus-2";
const users = [{ id: "t-main", schoolId: "s", campusId: CAMPUS_1 }, { id: "t-garden", schoolId: "s", campusId: CAMPUS_2 }];
const A_MAIN = "11111111-1111-4111-8111-111111111111", A_GARDEN = "22222222-2222-4222-8222-222222222222";
const I_MAIN = "33333333-3333-4333-8333-333333333333";
const actions: Action[] = [];
const items: Item[] = [];
const audits: unknown[] = [];
const match = (r: Record<string, unknown>, where: Record<string, unknown>): boolean => Object.entries(where).every(([k, v]) => k === "OR" ? (v as Record<string, unknown>[]).some(o => match(r, o)) : k === "id" && v && typeof v === "object" ? (v as { in: unknown[] }).in.includes(r.id) : r[k] === v);
const db = {
  user: { findMany: async ({ where }: { where: Record<string, unknown> }) => users.filter(u => match(u, where)).map(u => ({ id: u.id, fullName: u.id })) },
  confidentialMember: { findFirst: async () => null },
  evidenceReviewerGrant: { findMany: async () => [], findFirst: async () => null },
  evidenceFramework: { findFirst: async () => ({ id: "fw", schoolId: "s", campusId: null, status: "ACTIVE", name: "n", version: "1", criteria: [{ id: "c1", code: "C1", title: "t", interpretation: null, interpretationApprovedAt: null, interpretationApprovedById: null, sortOrder: 0 }] }), findFirstOrThrow: async () => ({ campusId: null }), findMany: async () => [{ id: "fw", name: "n", version: "1", status: "ACTIVE", createdAt: new Date() }] },
  evidencePack: { findMany: async () => [] },
  evidenceItem: {
    findMany: async () => items.map(i => ({ ...i, owner: undefined, title: "t", stance: "SUPPORTS", reviewBy: new Date("2099-01-01"), sourceDate: new Date(), createdAt: new Date(), reviewedById: null, reviewNote: null })),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => items.find(i => match(i, where)) ?? null,
    updateMany: async () => ({ count: 1 }), findFirstOrThrow: async () => items[0],
  },
  improvementAction: {
    findMany: async () => actions.map(a => ({ ...a, title: "t", criterionIds: ["c1"], dueDate: new Date(), expectedMeasure: "m", completionEvidenceId: null, completedById: null, interventionPlanId: null, createdAt: new Date() })),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => actions.find(a => match(a, where)) ?? null,
    update: async ({ where }: { where: { id: string } }) => { const a = actions.find(x => x.id === where.id)!; a.version++; return a; },
  },
  interventionPlan: { findMany: async () => [] }, reportCard: { findMany: async () => [] }, clinicVisit: { findMany: async () => [] }, carePlan: { findMany: async () => [] },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_t: unknown, _u: unknown, e: unknown) => { audits.push(e); } } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-05" } });

const lead = (role: string, campusId: string | null, userId = "lead-1") => ({ userId, schoolId: "s", role, campusId }) as never;
const status = (e: unknown) => (e as { status?: number }).status;
function seed() {
  actions.length = 0; items.length = 0; audits.length = 0;
  const base = { schoolId: "s", frameworkId: "fw", version: 1, status: "OPEN", milestones: [], reassessment: null, reflection: null };
  actions.push({ ...base, id: A_MAIN, ownerId: "t-main" }, { ...base, id: A_GARDEN, ownerId: "t-garden" });
  items.push({ id: I_MAIN, schoolId: "s", frameworkId: "fw", ownerId: "t-main", audience: "STAFF", criterionIds: ["c1"], createdById: "lead-9", sourceType: "DOCUMENT", sourceId: null, sourceVersion: "d1", sensitivity: "NONE", note: "Lesson observation note", reviewState: "PENDING", reviewedAt: null });
}

for (const role of ["PRINCIPAL", "CAMPUS_ADMIN"]) {
  test(`${role} of another campus gets 404 on follow-up, source and review for a campus-1 teacher`, async () => {
    seed();
    const svc = await import("../../src/lib/improvement/service");
    const garden = lead(role, CAMPUS_2);
    await assert.rejects(svc.recordFollowUp(garden, { actionId: A_MAIN, expectedVersion: 1, reflection: "x" }), e => status(e) === 404);
    await assert.rejects(svc.openSource(garden, I_MAIN), e => status(e) === 404);
    await assert.rejects(svc.reviewEvidence(garden, { itemId: I_MAIN, decision: "REQUEST_MORE", note: "more please" }), e => status(e) === 404);
    await assert.rejects(svc.completeAction(garden, { actionId: A_MAIN, expectedVersion: 1, evidenceId: I_MAIN }), e => status(e) === 404);
    assert.equal(actions[0].version, 1);
    assert.equal(items[0].reviewState, "PENDING");
  });

  test(`${role} workspace hides other-campus actions and evidence but keeps own campus`, async () => {
    seed();
    const svc = await import("../../src/lib/improvement/service");
    const garden = (await svc.workspace(lead(role, CAMPUS_2), "fw")).view!;
    assert.deepEqual(garden.actions.map(a => a.id), [A_GARDEN]);
    assert.equal(garden.criteria[0].items.length, 0);
    const main = (await svc.workspace(lead(role, CAMPUS_1), "fw")).view!;
    assert.deepEqual(main.actions.map(a => a.id), [A_MAIN]);
    assert.equal(main.criteria[0].items.length, 1);
    await svc.recordFollowUp(lead(role, CAMPUS_1), { actionId: A_MAIN, expectedVersion: 1, reflection: "ok" });
    assert.equal(actions[0].version, 2);
  });
}

test("unpinned or school-wide leaders keep school-wide access", async () => {
  seed();
  const svc = await import("../../src/lib/improvement/service");
  for (const l of [lead("PRINCIPAL", null), lead("ADMIN", CAMPUS_2), lead("SUPER_ADMIN", CAMPUS_2)]) {
    const v = (await svc.workspace(l, "fw")).view!;
    assert.equal(v.actions.length, 2);
  }
  await svc.openSource(lead("ADMIN", CAMPUS_2), I_MAIN);
});

// SKAI-2115: plain staff (teacher, accountant, ...) only see and open improvement records they own.
test("staff workspace and source are limited to the user's own actions and evidence", async () => {
  seed();
  const svc = await import("../../src/lib/improvement/service");
  const staff = (userId: string, role = "TEACHER") => lead(role, CAMPUS_1, userId);
  const other = (await svc.workspace(staff("t-garden"), "fw")).view!;
  assert.deepEqual(other.actions.map(a => a.id), [A_GARDEN]);
  assert.equal(other.criteria[0].items.length, 0);
  const owner = (await svc.workspace(staff("t-main"), "fw")).view!;
  assert.deepEqual(owner.actions.map(a => a.id), [A_MAIN]);
  assert.equal(owner.criteria[0].items.length, 1);
  const nonTeaching = (await svc.workspace(staff("acct-1", "ACCOUNTANT"), "fw")).view!;
  assert.equal(nonTeaching.actions.length, 0);
  assert.equal(nonTeaching.criteria[0].items.length, 0);
  await assert.rejects(svc.openSource(staff("acct-1", "ACCOUNTANT"), I_MAIN), e => status(e) === 404);
  await assert.rejects(svc.openSource(staff("t-garden"), I_MAIN), e => status(e) === 404);
  assert.deepEqual((await svc.openSource(staff("t-main"), I_MAIN)).content, { note: "Lesson observation note" });
  assert.equal((await svc.workspace(lead("ADMIN", null), "fw")).view!.actions.length, 2);
});

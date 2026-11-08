import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-790: retrieval vs transfer follow-ups and the due/overdue/missing list, scoped per school.
const plans = [
  { id: "a1", schoolId: "school-a", campusId: "campus-a", status: "ACTIVE", reviewDate: new Date("2026-01-01"), outcome: null },
  { id: "a2", schoolId: "school-a", campusId: "campus-a", status: "CLOSED", reviewDate: new Date("2026-01-01"), outcome: { decision: "INCONCLUSIVE", followUp: null } },
  { id: "a3", schoolId: "school-a", campusId: "campus-a", status: "CLOSED", reviewDate: new Date("2026-01-01"), outcome: { decision: "CLOSE", followUp: { measure: "Quiz", comparable: true } } },
  { id: "b1", schoolId: "school-b", campusId: "campus-b", status: "ACTIVE", reviewDate: new Date("2026-01-01"), outcome: null },
];
const wheres: Array<Record<string, unknown>> = [];
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  interventionPlan: { findMany: async ({ where }: { where: Record<string, unknown> }) => { wheres.push(where); return plans.filter(p => p.schoolId === where.schoolId && p.campusId === where.campusId).map(p => ({ ...p, version: 1, origin: "MANUAL", title: "Fractions", studentId: null, goal: null, ownerId: null, createdBy: "t", nextCheckInDate: null, familyShare: null, staleSince: null, staleReason: null })); } },
  user: { findMany: async () => [] }, student: { findMany: async () => [] },
} } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => new Date().toISOString().slice(0, 10) } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });

test("old follow-ups without a kind read as retrieval, never transfer", async () => {
  const { followUpKind } = await import("../../src/lib/learning/follow-ups");
  assert.equal(followUpKind({ followUp: { measure: "Quiz" } }), "RETRIEVAL");
  assert.equal(followUpKind({ followUp: { kind: "TRANSFER" } }), "TRANSFER");
  assert.equal(followUpKind({ followUp: null }), null);
});

test("follow-up gaps: due today, overdue, missing after review, none in the future", async () => {
  const { followUpGap } = await import("../../src/lib/learning/follow-ups");
  assert.equal(followUpGap({ status: "ACTIVE", reviewDate: "2026-11-05", outcome: null }, "2026-11-05"), "DUE");
  assert.equal(followUpGap({ status: "ACTIVE", reviewDate: "2026-11-01", outcome: null }, "2026-11-05"), "OVERDUE");
  assert.equal(followUpGap({ status: "ACTIVE", reviewDate: "2026-12-01", outcome: null }, "2026-11-05"), null);
  assert.equal(followUpGap({ status: "CLOSED", reviewDate: "2026-11-01", outcome: { followUp: null } }, "2026-11-05"), "MISSING");
  assert.equal(followUpGap({ status: "CLOSED", reviewDate: "2026-11-01", outcome: { followUp: { measure: "Quiz" } } }, "2026-11-05"), null);
  assert.equal(followUpGap({ status: "DRAFT", reviewDate: "2026-11-01", outcome: null }, "2026-11-05"), null);
});

test("the follow-up list stays inside each school and campus", async () => {
  const { listLearningActions } = await import("../../src/lib/learning/actions");
  const a = await listLearningActions({ userId: "t", schoolId: "school-a", campusId: "campus-a", role: "PRINCIPAL" } as never);
  const b = await listLearningActions({ userId: "t", schoolId: "school-b", campusId: "campus-b", role: "PRINCIPAL" } as never);
  assert.deepEqual(a.map(r => [r.id, r.followUpGap]), [["a1", "OVERDUE"], ["a2", "MISSING"], ["a3", null]]);
  assert.deepEqual(b.map(r => [r.id, r.followUpGap]), [["b1", "OVERDUE"]]);
  assert.equal(a.find(r => r.id === "a3")!.followUpKind, "RETRIEVAL");
  assert.deepEqual(wheres.map(w => w.schoolId), ["school-a", "school-b"]);
});

test("a denied role cannot list follow-ups", async () => {
  const { listLearningActions } = await import("../../src/lib/learning/actions");
  await assert.rejects(listLearningActions({ userId: "p", schoolId: "school-a", campusId: "campus-a", role: "PARENT" } as never));
});

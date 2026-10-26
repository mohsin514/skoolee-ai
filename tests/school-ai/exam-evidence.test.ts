import assert from "node:assert/strict";
import { test } from "node:test";
import type { TxClient } from "../../src/lib/db/prisma";
import { twinFor } from "../../src/lib/school-ai/exam-twin-service";
import { computeLedgerMetrics } from "../../src/lib/school-ai/pilot-ledger-service";
import { openExamExceptions } from "../../src/lib/academic/exam-office-service";
import { assessmentFixture } from "./assessment-fixture";
import { redis } from "../../src/lib/queue/connection";

// These are isolated service tests using the database doubles below; no delivery connection is used.
redis.disconnect();

test("Twin uses evidence released before the sitting and the last review known at its start", async () => {
  const { paper } = assessmentFixture();
  const cutoff = new Date("2026-09-01T08:00:00Z");
  const review = (marks: number) => ({ marks: [{ questionId: "q1", marks, feedback: "Checked" }], note: "Checked" });
  const attempts = Array.from({ length: 12 }, (_, index) => ({ id: `a${index}`, review: review(2), reviewVersion: 2, reviewedAt: new Date("2026-10-01"), responses: { q1: "a1" } }));
  const db = {
    schoolAiExamAssignment: { findMany: async (query: { where: Record<string, unknown>; take?: number }) => {
      assert.deepEqual(query.where.resultsReleasedAt, { lte: cutoff });
      assert.deepEqual(query.where.paperSnapshot, { path: ["subjectId"], equals: paper.subjectId });
      assert.equal(query.take, undefined, "another subject's recent sittings cannot crowd out evidence");
      return [{ id: "earlier", paperSnapshot: paper }];
    } },
    schoolAiExamAttempt: { findMany: async () => attempts },
    schoolAiExamResultRevision: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where.createdAt, { lte: cutoff });
      return attempts.map(row => ({ attemptId: row.id, review: review(0) }));
    } },
  } as unknown as TxClient;
  const twin = await twinFor(db, "school", { id: "current", campusId: "campus", classId: paper.classId, startsAt: cutoff, resultsReleasedAt: null }, paper);
  assert.deepEqual([twin.evidenceCutoff, twin.forecast[0].facility, twin.forecast[0].sample], [cutoff.toISOString(), 0, 12]);
  assert.equal(twin.comparison, null);
});

test("Pilot Ledger uses event dates, closed windows, independent decisions and every released sitting", async () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const window = { gte: since, lte: now };
  const db = {
    examPaperSlot: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where.sealedAt, window);
      return [{ requestedAt: new Date("2026-10-20"), dueOn: new Date("2026-10-22"), sealedAt: new Date("2026-10-23") }];
    } },
    schoolAiResultCorrection: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where.decidedAt, window);
      assert.equal(query.where.createdAt, undefined, "a correction proposed earlier but decided now belongs in this window");
      return [{ status: "APPROVED", proposedById: "teacher", decidedById: "head" }, { status: "APPROVED", proposedById: "teacher", decidedById: "teacher" }];
    } },
    familyResultNote: { findMany: async (query: { where: Record<string, unknown> }) => {
      assert.deepEqual(query.where.sentAt, window);
      assert.equal(query.where.status, "SENT");
      return [{ status: "SENT" }];
    } },
    examBriefReceipt: { count: async (query: { where: Record<string, unknown> }) => { assert.deepEqual(query.where.acknowledgedAt, window); return 2; } },
    schoolAiExamAssignment: { findMany: async (query: { where: Record<string, unknown>; take?: number; orderBy?: unknown }) => {
      assert.deepEqual(query.where.resultsReleasedAt, window);
      assert.equal(query.take, undefined, "PL-6 must not silently report a 50-sitting subset");
      assert.ok(query.orderBy);
      return [];
    } },
  } as unknown as TxClient;
  const metrics = await computeLedgerMetrics(db, "school", now);
  assert.deepEqual(metrics.map(metric => [metric.claim, metric.value]), [["PL-1", 0], ["PL-2", 3], ["PL-3", 1], ["PL-4", 1], ["PL-5", 2], ["PL-6", null]]);
});

test("report-card publication also checks appeals on linked sittings before gradebook transfer", async () => {
  const db = {
    examSchedule: { findMany: async () => [{ id: "schedule" }] },
    schoolAiExamAssignment: { findMany: async (query: { where: { OR: unknown[] } }) => {
      assert.deepEqual(query.where.OR, [{ gradebookPublication: { path: ["examId"], equals: "exam" } }, { examScheduleId: { in: ["schedule"] } }]);
      return [{ id: "sitting" }];
    } },
    examException: { count: async () => 0 },
    schoolAiExamAppeal: { count: async (query: { where: { assignmentId: unknown } }) => { assert.deepEqual(query.where.assignmentId, { in: ["sitting"] }); return 1; } },
    schoolAiResultCorrection: { count: async () => 1 },
  } as unknown as TxClient;
  assert.deepEqual(await openExamExceptions(db, "school", "exam"), { exceptions: 0, appeals: 1, corrections: 1, total: 2 });
});

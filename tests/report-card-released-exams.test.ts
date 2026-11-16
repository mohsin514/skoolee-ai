import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubjectDistribution, examStatusFilter } from "../src/lib/academic/grade-calculator";

// SKAI-2108: a published report card must not carry marks from exams the school has not released.
test("default filter keeps the legacy behaviour", () => {
  assert.deepEqual(examStatusFilter(), { status: { notIn: ["DRAFT", "ACTIVE"] } });
});

test("released-only filter allows PUBLISHED exams and the card's own exam, nothing else", () => {
  assert.deepEqual(examStatusFilter({ includeExamId: "mid" }), { OR: [{ status: "PUBLISHED" }, { id: "mid" }] });
  assert.deepEqual(examStatusFilter({}), { OR: [{ status: "PUBLISHED" }] });
});

test("buildSubjectDistribution queries only released exams when releasedOnly is set", async () => {
  let examWhere: any;
  const db: any = {
    subject: { findMany: async () => [{ id: "s1", name: "Math", totalMarks: 100 }] },
    exam: { findMany: async (args: any) => { examWhere = args.where; return []; } },
    mark: { findMany: async () => [] },
  };
  const weightConfig: any = { quizWeight: 10, classTestWeight: 0, midTermWeight: 40, finalWeight: 50, thresholds: [] };
  await buildSubjectDistribution({ studentId: "st", campusId: "c", classId: "k", academicYear: 2026, weightConfig, releasedOnly: { includeExamId: "mid" } }, db);
  assert.deepEqual(examWhere.OR, [{ status: "PUBLISHED" }, { id: "mid" }]);
  assert.equal(examWhere.status, undefined);
});

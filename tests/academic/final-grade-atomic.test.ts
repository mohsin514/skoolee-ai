import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1689: a rejected or failed generation leaves no exam, audit or report card behind.
type Row = Record<string, unknown> & { id: string };
const db = { exams: [] as Row[], cards: [] as Row[], audits: [] as Row[] };
const state = { grades: [] as unknown[], failOnCard: 0, role: "PRINCIPAL", campusId: "campus-a", schoolId: "qa-01" };

function table(rows: Row[], prefix: string) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => Object.entries(where).every(([k, v]) => (r[k] ?? null) === v)) ?? null,
    findMany: async ({ where }: { where: { examId: string } }) => rows.filter((r) => r.examId === where.examId),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (prefix === "c" && state.failOnCard && rows.length + 1 >= state.failOnCard) throw new Error("db down");
      const row = { ...data, id: `${prefix}${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
  };
}

mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  class: { findFirst: async ({ where }: { where: { campusId: string } }) => (where.campusId === "campus-a" ? { id: "class-qa01", name: "Grade 6", section: "A" } : null) },
  subject: { findMany: async () => [{ id: "s1", name: "Maths", totalMarks: 100 }] },
} } });
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => ({ userId: "u1", schoolId: state.schoolId, campusId: state.campusId, role: state.role }) } });
mock.module("@/lib/api/scope", { namedExports: { canLeadAcademics: async (u: { role: string }) => u.role === "PRINCIPAL", canManageAcademics: () => true } });
mock.module("@/lib/academic/grade-calculator", { namedExports: { calculateWeightedGradeForClass: async () => state.grades } });
mock.module("@/lib/academic/report-versions", { namedExports: {
  ReportConflict: class extends Error {},
  refreshVersion: async () => undefined,
  // A real transaction: work happens on a copy and is committed only when fn resolves.
  versionTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const draft = { exams: [...db.exams], cards: [...db.cards], audits: [...db.audits] };
    const tx = { $executeRaw: async () => 1, exam: table(draft.exams, "e"), reportCard: table(draft.cards, "c"), auditLog: table(draft.audits, "a") };
    const out = await fn(tx);
    Object.assign(db, draft);
    return out;
  },
} });

const grade = (studentId: string) => ({ studentId, overallPercentage: 80, overallGrade: "A", subjectBreakdown: [{ obtainedMarks: 80 }] });
const post = async () => {
  const { POST } = await import("../../src/app/api/reports/generate-from-grades/route");
  const res = await POST(new Request("http://x/api/reports/generate-from-grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId: "class-qa01", academicYear: 2026 }) }) as never);
  return res.status;
};
const reset = () => { db.exams = []; db.cards = []; db.audits = []; Object.assign(state, { grades: [], failOnCard: 0, role: "PRINCIPAL", campusId: "campus-a" }); };

test("no grade data: 400 and nothing written; a later retry creates exactly one exam and card set", async () => {
  reset();
  assert.equal(await post(), 400);
  assert.deepEqual([db.exams.length, db.cards.length, db.audits.length], [0, 0, 0]);
  state.grades = [grade("p1"), grade("p2")];
  assert.equal(await post(), 200);
  assert.equal(db.exams.length, 1);
  assert.equal(db.exams[0].status, "PUBLISHED");
  assert.equal(db.cards.length, 2);
  assert.equal(await post(), 200, "a replay updates, never duplicates");
  assert.deepEqual([db.exams.length, db.cards.length], [1, 2]);
});

test("a failure part-way through the cards rolls the exam back", async () => {
  reset();
  state.grades = [grade("p1"), grade("p2")];
  state.failOnCard = 2;
  assert.equal(await post(), 500);
  assert.deepEqual([db.exams.length, db.cards.length, db.audits.length], [0, 0, 0]);
});

test("a denied role gets 403 and another school's campus cannot see the class", async () => {
  reset();
  state.grades = [grade("p1")];
  state.role = "TEACHER";
  assert.equal(await post(), 403);
  state.role = "PRINCIPAL";
  state.campusId = "campus-b";
  state.schoolId = "qa-02";
  assert.equal(await post(), 404);
  assert.equal(db.exams.length, 0);
  state.schoolId = "qa-01";
});

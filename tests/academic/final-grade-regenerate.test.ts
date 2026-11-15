import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1492: regenerating final grades keeps authored remarks, delivery history and the published version
// path. Changed marks go through refreshVersion; a sent card stays sent; another campus/school sees nothing.
type Row = Record<string, unknown> & { id: string };
const db = { exams: [] as Row[], cards: [] as Row[], audits: [] as Row[] };
const state = {
  grades: [] as unknown[],
  role: "PRINCIPAL",
  campusId: "campus-a",
  schoolId: "qa-01",
  refreshed: [] as string[],
};

function table(rows: Row[], prefix: string) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => (r[k] ?? null) === v)) ?? null,
    findMany: async ({ where }: { where: { examId: string } }) => rows.filter((r) => r.examId === where.examId),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, id: `${prefix}${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Object.assign(rows.find((r) => r.id === where.id)!, data),
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
  refreshVersion: async (_tx: unknown, id: string) => {
    state.refreshed.push(id);
  },
  versionTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const draft = { exams: [...db.exams], cards: [...db.cards], audits: [...db.audits] };
    const tx = { $executeRaw: async () => 1, exam: table(draft.exams, "e"), reportCard: table(draft.cards, "c"), auditLog: table(draft.audits, "a") };
    const out = await fn(tx);
    Object.assign(db, draft);
    return out;
  },
} });

const grade = (studentId: string, pct: number) => ({
  studentId,
  overallPercentage: pct,
  overallGrade: pct >= 80 ? "A" : "B",
  subjectBreakdown: [{ obtainedMarks: pct }],
});
const post = async (classId = "class-qa01") => {
  const { POST } = await import("../../src/app/api/reports/generate-from-grades/route");
  const res = await POST(new Request("http://x/api/reports/generate-from-grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId, academicYear: 2026 }) }) as never);
  return res.status;
};
const reset = () => {
  db.exams = [];
  db.cards = [];
  db.audits = [];
  Object.assign(state, { grades: [], role: "PRINCIPAL", campusId: "campus-a", schoolId: "qa-01", refreshed: [] });
};

test("regeneration after a mark change keeps remarks and delivery, and refreshes the version of each card", async () => {
  reset();
  state.grades = [grade("p1", 80), grade("p2", 70)];
  assert.equal(await post(), 200);
  const sent = db.cards.find((c) => c.studentId === "p1")!;
  // Teacher-authored remarks, approval and delivery that already happened.
  Object.assign(sent, { remarksEn: "Strong term", remarksUr: "عمدہ", remarksApproved: true, isSent: true, deliveryStatus: "SENT" });
  state.grades = [grade("p1", 65), grade("p2", 70)];
  assert.equal(await post(), 200);
  assert.equal(sent.percentage, 65, "marks are recalculated");
  assert.equal(sent.remarksEn, "Strong term");
  assert.equal(sent.remarksUr, "عمدہ");
  assert.equal(sent.remarksApproved, true);
  assert.equal(sent.isSent, true, "a sent card stays sent");
  assert.equal(sent.deliveryStatus, "SENT", "delivery history is not reset to PENDING");
  assert.deepEqual(state.refreshed.sort(), db.cards.map((c) => c.id).sort(), "every existing card gets a version refresh");
  assert.equal(db.exams.length, 1);
  assert.equal(db.cards.length, 2);
});

test("a teacher is denied regeneration and another school's campus cannot touch the class", async () => {
  reset();
  state.grades = [grade("p1", 80)];
  assert.equal(await post(), 200);
  const before = JSON.stringify(db.cards);
  state.role = "TEACHER";
  assert.equal(await post(), 403);
  state.role = "PRINCIPAL";
  state.campusId = "campus-b";
  state.schoolId = "qa-02";
  assert.equal(await post(), 404);
  assert.equal(JSON.stringify(db.cards), before, "denied calls write nothing");
  assert.equal(state.refreshed.length, 0, "creating new cards does not refresh versions; denied calls do not either");
});

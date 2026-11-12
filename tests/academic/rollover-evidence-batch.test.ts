import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1877: rollover evidence is worked out per class with a constant number of queries, not per learner.
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
const calls: Array<{ model: string; where: Where }> = [];
const state = { missingPolicy: "COUNT_AS_ZERO", failSubjects: false };

const matches = (row: Row, where: Where) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === "object" && "in" in v) return (v as { in: unknown[] }).in.includes(row[k]);
  if (v && typeof v === "object" && "notIn" in v) return !(v as { notIn: unknown[] }).notIn.includes(row[k]);
  return row[k] === v;
});

// Two classes on campus-a (school qa-01) and a second school's campus reusing the same class and learner ids.
const SIZE = 30;
const learners = ["class-a", "class-b"].flatMap((classId) => Array.from({ length: SIZE }, (_, i) => ({ id: `${classId}-st${i}`, fullName: `Pupil ${i}`, classId })));
const subjects = ["class-a", "class-b"].flatMap((classId) => [
  { id: `${classId}-maths`, name: "Maths", totalMarks: 100, classId, campusId: "campus-a" },
  { id: `${classId}-eng`, name: "English", totalMarks: 50, classId, campusId: "campus-a" },
]);
const exams: Row[] = ["class-a", "class-b"].flatMap((classId) => [
  { id: `${classId}-mid`, title: "Mid", examType: "MID_TERM", totalMarks: 150, subjectId: null, classId, campusId: "campus-a", schoolId: "qa-01", academicYear: 2026, status: "PUBLISHED" },
  { id: `${classId}-fin`, title: "Final", examType: "FINAL", totalMarks: 150, subjectId: null, classId, campusId: "campus-a", schoolId: "qa-01", academicYear: 2026, status: "LOCKED" },
  // Still taking marks: never evidence for rollover.
  { id: `${classId}-open`, title: "Open", examType: "QUIZ", totalMarks: 100, subjectId: null, classId, campusId: "campus-a", schoolId: "qa-01", academicYear: 2026, status: "MARKS_ENTRY" },
  { id: `${classId}-other`, title: "Other school", examType: "FINAL", totalMarks: 150, subjectId: null, classId, campusId: "campus-b", schoolId: "qa-02", academicYear: 2026, status: "LOCKED" },
]);
const marks: Row[] = [];
learners.forEach((l, n) => {
  const i = n % SIZE;
  const mark = (exam: string, subject: string, marksObtained: number, extra: Row = {}) =>
    marks.push({ studentId: l.id, examId: `${l.classId}-${exam}`, subjectId: `${l.classId}-${subject}`, marksObtained, isAbsent: false, isExempt: false, campusId: "campus-a", schoolId: "qa-01", ...extra });
  if (i === 4) return; // no marks at all
  if (i === 5) { mark("open", "maths", 90); return; } // only an unfinished exam
  if (i === 6) { mark("other", "maths", 90, { campusId: "campus-b", schoolId: "qa-02" }); return; } // only the other school's marks
  mark("mid", "maths", (i * 7) % 100);
  mark("mid", "eng", (i * 3) % 50, { isAbsent: i === 3 });
  if (i % 2) mark("fin", "maths", (i * 11) % 100);
  if (i % 3) mark("fin", "eng", 40);
});

const record = (model: string, where: Where) => calls.push({ model, where });
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  student: { findUnique: async ({ where }: { where: { id: string } }) => learners.find((l) => l.id === where.id) ?? null },
  academicModelVersion: { findMany: async ({ where }: { where: Where }) => { record("academicModelVersion.findMany", where); return []; } },
  gradeWeightConfig: { findUnique: async ({ where }: { where: Where }) => {
    record("gradeWeightConfig.findUnique", where);
    return { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, weightMode: "NORMALIZED", missingMarkPolicy: state.missingPolicy, absentMarkPolicy: "COUNT_AS_ZERO", exemptMarkPolicy: "EXCLUDE", roundingRule: "WHOLE", academicModelVersionId: null, gradeAplus: 90, gradeA: 80, gradeB: 70, gradeC: 60, gradeD: 50 };
  } },
  subject: { findMany: async ({ where }: { where: Where }) => {
    record("subject.findMany", where);
    if (state.failSubjects) throw new Error("Timed out fetching a new connection from the connection pool");
    return subjects.filter((s) => matches(s, where));
  } },
  exam: { findMany: async ({ where }: { where: Where }) => { record("exam.findMany", where); return exams.filter((e) => matches(e, where)); } },
  mark: {
    findMany: async ({ where }: { where: Where }) => { record("mark.findMany", where); return marks.filter((m) => matches(m, where)); },
    count: async ({ where }: { where: Where }) => marks.filter((m) => matches(m, where)).length,
    groupBy: async ({ by, where }: { by: string[]; where: Where }) => {
      record("mark.groupBy", where);
      assert.deepEqual(by, ["studentId"]);
      return [...new Set(marks.filter((m) => matches(m, where)).map((m) => m.studentId))].map((studentId) => ({ studentId }));
    },
  },
} } });

const load = async () => ({ ...(await import("../../src/lib/academic/rollover-evidence")), ...(await import("../../src/lib/academic/grade-calculator")) });

/** The removed per-learner path, kept here as the reference the batch must match. */
async function oneAtATime(campusId: string, l: { id: string; classId: string }) {
  const { calculateWeightedGrade } = await load();
  const { prisma } = await import("@/lib/db/prisma");
  const done = exams.filter((e) => matches(e, { campusId, classId: l.classId, academicYear: 2026, status: { notIn: ["DRAFT", "ACTIVE", "MARKS_ENTRY"] } }));
  const count = done.length ? await prisma.mark.count({ where: { studentId: l.id, examId: { in: done.map((e) => String(e.id)) } } }) : 0;
  if (!count) return { evidence: "MISSING", detail: { note: "No locked marks recorded for this year." } };
  try {
    const r = await calculateWeightedGrade(l.id, campusId, l.classId, 2026);
    return { evidence: r.passed ? "PASSED" : "FAILED", detail: { percentage: Math.round(r.overallPercentage * 10) / 10, grade: r.overallGrade } };
  } catch (error) {
    return { evidence: "MISSING", detail: { note: (error as Error).message } };
  }
}

test("query count depends on classes, not learners, and every query is tenant scoped", async () => {
  const { rolloverEvidence } = await load();
  calls.length = 0;
  const result = await rolloverEvidence("qa-01", "campus-a", 2026, learners);
  assert.equal(result.size, learners.length);
  assert.ok(calls.length <= 2 * 7, `expected at most 7 queries per class, saw ${calls.length}`);
  assert.equal(calls.filter((c) => c.model === "mark.findMany").length, 2);
  for (const c of calls.filter((c) => c.model === "exam.findMany" || c.model.startsWith("mark."))) assert.ok(c.where.campusId === "campus-a" || c.where.schoolId === "qa-01", c.model);
  for (const c of calls.filter((c) => c.model === "mark.groupBy")) assert.equal(c.where.schoolId, "qa-01");
  assert.equal(calls.filter((c) => c.model === "exam.findMany" && c.where.status).every((c) => c.where.campusId === "campus-a"), true);
});

test("every learner gets exactly the evidence the one-at-a-time path produced", async () => {
  const { rolloverEvidence } = await load();
  const result = await rolloverEvidence("qa-01", "campus-a", 2026, learners);
  for (const l of learners) assert.deepEqual(result.get(l.id), await oneAtATime("campus-a", l), l.id);
  const counts = { PASSED: 0, FAILED: 0, MISSING: 0 } as Record<string, number>;
  for (const r of result.values()) counts[r.evidence]++;
  assert.ok(counts.PASSED > 0 && counts.FAILED > 0 && counts.MISSING === 6, JSON.stringify(counts));
  // An unfinished exam or another school's marks never count as evidence.
  assert.deepEqual(result.get("class-a-st5"), { evidence: "MISSING", detail: { note: "No locked marks recorded for this year." } });
  assert.deepEqual(result.get("class-a-st6"), { evidence: "MISSING", detail: { note: "No locked marks recorded for this year." } });
});

test("another school or campus sees no evidence from campus-a", async () => {
  const { rolloverEvidence } = await load();
  for (const [school, campus] of [["qa-02", "campus-a"], ["qa-01", "campus-b"]]) {
    const result = await rolloverEvidence(school, campus, 2026, learners.slice(0, 3));
    for (const r of result.values()) assert.equal(r.evidence, "MISSING");
  }
});

test("a learner the academic model blocks keeps its own message", async () => {
  const { rolloverEvidence } = await load();
  state.missingPolicy = "BLOCK";
  try {
    const result = await rolloverEvidence("qa-01", "campus-a", 2026, learners);
    for (const l of learners) assert.deepEqual(result.get(l.id), await oneAtATime("campus-a", l), l.id);
    assert.match((result.get("class-a-st0")!.detail as { note: string }).note, /blocks calculation/);
  } finally {
    state.missingPolicy = "COUNT_AS_ZERO";
  }
});

test("a failed grade load is recorded per learner with marks, as before", async () => {
  const { rolloverEvidence } = await load();
  state.failSubjects = true;
  try {
    const result = await rolloverEvidence("qa-01", "campus-a", 2026, learners);
    assert.match((result.get("class-a-st0")!.detail as { note: string }).note, /connection pool/);
    assert.deepEqual(result.get("class-a-st4"), { evidence: "MISSING", detail: { note: "No locked marks recorded for this year." } });
  } finally {
    state.failSubjects = false;
  }
});

test("preparePlan stays behind the registrar check and uses the batched evidence", () => {
  const src = readFileSync("src/lib/academic/rollover.ts", "utf8");
  const prepare = src.slice(src.indexOf("export async function preparePlan"));
  assert.ok(prepare.indexOf("await assertRegistrar(user)") < prepare.indexOf("rolloverEvidence("));
  assert.match(prepare, /const evidence = await rolloverEvidence\(user\.schoolId, campusId, sourceYear, learners\)/);
  assert.doesNotMatch(src, /calculateWeightedGrade\(/);
});

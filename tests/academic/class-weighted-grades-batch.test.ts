import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1832: class weighted grades load shared data once and run one mark query for the whole roster.
type Where = Record<string, unknown>;
const calls: Array<{ model: string; where: Where }> = [];
const state = { failMarks: false, missingPolicy: "COUNT_AS_ZERO" as string };

const inList = (value: unknown, list: unknown) => !list || (list as { in: unknown[] }).in.includes(value);

// Two schools / campuses share student ids on purpose: only campus-a rows may count.
const students = Array.from({ length: 40 }, (_, i) => ({ id: `st${i}`, fullName: `Pupil ${i}`, classId: "class-a", campusId: "campus-a", rollNo: String(i).padStart(2, "0"), archivedAt: null, status: "active" }));
const subjects = [{ id: "maths", name: "Maths", totalMarks: 100, classId: "class-a", campusId: "campus-a" }, { id: "eng", name: "English", totalMarks: 50, classId: "class-a", campusId: "campus-a" }];
const exams = [
  { id: "mid", title: "Mid", examType: "MID_TERM", totalMarks: 150, subjectId: null, classId: "class-a", campusId: "campus-a" },
  { id: "fin", title: "Final", examType: "FINAL", totalMarks: 150, subjectId: null, classId: "class-a", campusId: "campus-a" },
  { id: "quiz", title: "Quiz", examType: "QUIZ", totalMarks: 100, subjectId: "maths", classId: "class-a", campusId: "campus-a" },
];
const marks: Array<Record<string, unknown>> = [];
students.forEach((s, i) => {
  if (i === 7) return; // pupil 7 has no marks at all
  marks.push({ studentId: s.id, examId: "mid", subjectId: "maths", marksObtained: (i * 7) % 100, isAbsent: false, isExempt: false, campusId: "campus-a", schoolId: "qa-01" });
  marks.push({ studentId: s.id, examId: "mid", subjectId: "eng", marksObtained: (i * 3) % 50, isAbsent: i === 3, isExempt: false, campusId: "campus-a", schoolId: "qa-01" });
  marks.push({ studentId: s.id, examId: "fin", subjectId: "maths", marksObtained: (i * 11) % 100, isAbsent: false, isExempt: i === 5, campusId: "campus-a", schoolId: "qa-01" });
  if (i % 2) {
    marks.push({ studentId: s.id, examId: "quiz", subjectId: "maths", marksObtained: 90, isAbsent: false, isExempt: false, campusId: "campus-a", schoolId: "qa-01" });
    marks.push({ studentId: s.id, examId: "fin", subjectId: "eng", marksObtained: 40, isAbsent: false, isExempt: false, campusId: "campus-a", schoolId: "qa-01" });
  }
  // Same ids in another school's campus: must never be read into campus-a grades.
  marks.push({ studentId: s.id, examId: "fin", subjectId: "eng", marksObtained: 50, isAbsent: false, isExempt: false, campusId: "campus-b", schoolId: "qa-02" });
});

const record = (model: string, where: Where) => calls.push({ model, where });
const matches = (row: Record<string, unknown>, where: Where) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" && "in" in (v as object) ? inList(row[k], v) : v && typeof v === "object" ? true : row[k] === v));

mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  student: {
    findMany: async ({ where }: { where: Where }) => { record("student.findMany", where); return students.filter((s) => matches(s, where)); },
    findUnique: async ({ where }: { where: { id: string } }) => { record("student.findUnique", where); return students.find((s) => s.id === where.id) ?? null; },
  },
  academicModelVersion: { findMany: async ({ where }: { where: Where }) => { record("academicModelVersion.findMany", where); return []; } },
  gradeWeightConfig: { findUnique: async ({ where }: { where: Where }) => {
    record("gradeWeightConfig.findUnique", where);
    return { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, weightMode: "NORMALIZED", missingMarkPolicy: state.missingPolicy, absentMarkPolicy: "COUNT_AS_ZERO", exemptMarkPolicy: "EXCLUDE", roundingRule: "WHOLE", academicModelVersionId: null, gradeAplus: 90, gradeA: 80, gradeB: 70, gradeC: 60, gradeD: 50 };
  } },
  subject: { findMany: async ({ where }: { where: Where }) => { record("subject.findMany", where); return subjects.filter((s) => matches(s, where)); } },
  exam: { findMany: async ({ where }: { where: Where }) => { record("exam.findMany", where); return exams.filter((e) => e.classId === where.classId && e.campusId === where.campusId); } },
  mark: { findMany: async ({ where }: { where: Where }) => {
    record("mark.findMany", where);
    if (state.failMarks) throw new Error("Timed out fetching a new connection from the connection pool");
    return marks.filter((m) => matches(m, where));
  } },
} } });

const calculator = () => import("../../src/lib/academic/grade-calculator");

test("a 40-pupil class runs a constant number of queries, with one campus-scoped mark query", async () => {
  const { calculateWeightedGrade, calculateWeightedGradeForClass, calculateWeightedGradesForStudents } = await calculator();
  calls.length = 0;
  const ranked = await calculateWeightedGradeForClass("class-a", "campus-a", 2026);
  assert.equal(ranked.length, 40);
  const markCalls = calls.filter((c) => c.model === "mark.findMany");
  assert.equal(markCalls.length, 1);
  assert.equal(markCalls[0].where.campusId, "campus-a");
  assert.equal((markCalls[0].where.studentId as { in: string[] }).in.length, 40);
  assert.ok(calls.length <= 6, `expected a constant query count, saw ${calls.length}`);
  assert.equal(calls.filter((c) => c.model === "gradeWeightConfig.findUnique").length, 1);
});

test("batched results match the single-pupil path for every pupil", async () => {
  const { calculateWeightedGrade, calculateWeightedGradeForClass, calculateWeightedGradesForStudents } = await calculator();
  const ranked = await calculateWeightedGradeForClass("class-a", "campus-a", 2026);
  for (const row of ranked) {
    const single = await calculateWeightedGrade(row.studentId, "campus-a", "class-a", 2026);
    const { rank, ...batched } = row;
    assert.ok(rank >= 1);
    assert.deepEqual(batched, single);
  }
  // The other campus's English final mark never reaches campus-a grades.
  const one = ranked.find((r) => r.studentId === "st2")!;
  assert.equal(one.subjectBreakdown.find((s) => s.subjectId === "eng")!.obtainedMarks, 6);
});

test("a database error fails the request instead of dropping pupils from the ranking", async () => {
  const { calculateWeightedGrade, calculateWeightedGradeForClass, calculateWeightedGradesForStudents } = await calculator();
  state.failMarks = true;
  try {
    await assert.rejects(calculateWeightedGradeForClass("class-a", "campus-a", 2026), /connection pool/);
  } finally {
    state.failMarks = false;
  }
});

test("a pupil the academic model blocks is still left out, as before", async () => {
  const { calculateWeightedGrade, calculateWeightedGradeForClass, calculateWeightedGradesForStudents } = await calculator();
  state.missingPolicy = "BLOCK";
  try {
    const results = await calculateWeightedGradesForStudents(students.slice(0, 9), "campus-a", "class-a", 2026);
    // Pupil 7 has no marks and every even pupil lacks campus-a quiz and English final marks: all blocked.
    assert.deepEqual(results.map((r) => r !== null), students.slice(0, 9).map((_, i) => i % 2 === 1 && i !== 7));
    await assert.rejects(calculateWeightedGrade("st7", "campus-a", "class-a", 2026), /blocks calculation/);
  } finally {
    state.missingPolicy = "COUNT_AS_ZERO";
  }
});

test("another campus sees none of campus-a's pupils", async () => {
  const { calculateWeightedGrade, calculateWeightedGradeForClass, calculateWeightedGradesForStudents } = await calculator();
  assert.deepEqual(await calculateWeightedGradeForClass("class-a", "campus-b", 2026), []);
});

test("the grading-rules preview batches each section instead of calculating per pupil", () => {
  const route = readFileSync("src/app/api/grade-config/route.ts", "utf8");
  assert.doesNotMatch(route, /calculateWeightedGrade\(student\.id/);
  assert.match(route, /calculateWeightedGradesForStudents\(pupils, session\.campusId!, section\.id, academicYear, prisma, undefined, proposed\)/);
});

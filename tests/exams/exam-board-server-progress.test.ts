import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { examProgressFor, type ProgressDb } from "@/lib/academic/exam-progress";

// SKAI-1815: the exam board counts marking progress on the server, in a fixed number of
// queries, with the same numbers the old per-exam GET /api/marks sweep produced.

type Student = { id: string; schoolId: string; classId: string; archivedAt: Date | null };
type Mark = { schoolId: string; campusId: string; examId: string; studentId: string; subjectId: string };
type Klass = { id: string; schoolId: string; classTeacherId: string | null; subjects: { id: string; teacherId: string | null }[] };

const classes: Klass[] = [
  { id: "c-a", schoolId: "school-a", classTeacherId: "t-class", subjects: [{ id: "maths", teacherId: "t-maths" }, { id: "eng", teacherId: "t-eng" }] },
  { id: "c-b", schoolId: "school-b", classTeacherId: null, subjects: [{ id: "b-maths", teacherId: "t-b" }] },
];
const students: Student[] = [
  { id: "s1", schoolId: "school-a", classId: "c-a", archivedAt: null },
  { id: "s2", schoolId: "school-a", classId: "c-a", archivedAt: null },
  { id: "s3", schoolId: "school-a", classId: "c-a", archivedAt: new Date() }, // archived: off the roster
  { id: "s4", schoolId: "school-a", classId: "c-other", archivedAt: null }, // moved class
  { id: "b1", schoolId: "school-b", classId: "c-b", archivedAt: null },
];
const mk = (examId: string, studentId: string, subjectId: string, schoolId = "school-a", campusId = "campus-a"): Mark => ({ schoolId, campusId, examId, studentId, subjectId });
const marks: Mark[] = [
  mk("e-1", "s1", "maths"), mk("e-1", "s2", "maths"), mk("e-1", "s1", "eng"),
  mk("e-1", "s3", "eng"), // archived student: not entered
  mk("e-1", "s4", "maths"), // student no longer in the class: not entered
  mk("e-1", "s1", "removed-subject"), // subject no longer on the class
  mk("e-b", "b1", "b-maths", "school-b", "campus-b"),
];

function matches(m: Mark, where: any): boolean {
  if (where.schoolId && m.schoolId !== where.schoolId) return false;
  if (where.OR) return where.OR.some((w: any) => matches(m, w));
  if (where.examId?.in && !where.examId.in.includes(m.examId)) return false;
  if (where.campusId && m.campusId !== where.campusId) return false;
  if (where.student) {
    const s = students.find((x) => x.id === m.studentId);
    if (!s || s.classId !== where.student.classId || (where.student.archivedAt === null && s.archivedAt !== null)) return false;
  }
  return true;
}

function fakeDb() {
  const calls: { model: string; where: any }[] = [];
  const db: ProgressDb = {
    class: {
      async findMany({ where }: any) {
        calls.push({ model: "class", where });
        return classes
          .filter((c) => where.id.in.includes(c.id) && c.schoolId === where.schoolId)
          .map((c) => ({ ...c, _count: { students: students.filter((s) => s.classId === c.id && !s.archivedAt).length } }));
      },
    },
    mark: {
      async groupBy({ where }: any) {
        calls.push({ model: "mark", where });
        const out = new Map<string, { examId: string; subjectId: string; _count: { _all: number } }>();
        for (const m of marks.filter((x) => matches(x, where))) {
          const key = `${m.examId}:${m.subjectId}`;
          const row = out.get(key) ?? { examId: m.examId, subjectId: m.subjectId, _count: { _all: 0 } };
          row._count._all += 1;
          out.set(key, row);
        }
        return [...out.values()];
      },
    },
  };
  return { db, calls };
}

const examA = { id: "e-1", campusId: "campus-a", classId: "c-a", subjectId: null };
const admin = { userId: "admin", role: "ADMIN", schoolId: "school-a", campusId: "campus-a" };

test("admin: active roster x class subjects, archived and moved students and removed subjects not counted", async () => {
  const { db, calls } = fakeDb();
  const out = await examProgressFor(db, admin, [examA]);
  assert.deepEqual(out["e-1"], { subjectsCount: 2, studentsCount: 2, markedSubjects: 3, enteredMarks: 3, expectedMarks: 4 });
  // A fixed number of queries, every one scoped to the caller's school.
  assert.equal(calls.length, 3);
  for (const c of calls) assert.equal(c.where.schoolId, "school-a");
});

test("subject-specific exam counts only that subject", async () => {
  const { db } = fakeDb();
  const out = await examProgressFor(db, admin, [{ ...examA, subjectId: "eng" }]);
  assert.deepEqual(out["e-1"], { subjectsCount: 1, studentsCount: 2, markedSubjects: 3, enteredMarks: 1, expectedMarks: 2 });
});

test("subject teacher sees their subjects; class teacher sees all; other teacher is unavailable", async () => {
  const { db } = fakeDb();
  const subj = await examProgressFor(db, { userId: "t-maths", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" }, [examA]);
  assert.deepEqual(subj["e-1"], { subjectsCount: 1, studentsCount: 2, markedSubjects: 1, enteredMarks: 2, expectedMarks: 2 });
  const lead = await examProgressFor(db, { userId: "t-class", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" }, [examA]);
  assert.equal(lead["e-1"]?.enteredMarks, 3);
  assert.equal(lead["e-1"]?.markedSubjects, 2);
  const denied = await examProgressFor(db, { userId: "t-none", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" }, [examA]);
  assert.equal(denied["e-1"], null);
});

test("two schools: another school's class and marks never leak in", async () => {
  const { db } = fakeDb();
  const out = await examProgressFor(db, admin, [{ id: "e-b", campusId: "campus-a", classId: "c-b", subjectId: null }]);
  assert.equal(out["e-b"], null);
  const own = await examProgressFor(db, { userId: "b-admin", role: "ADMIN", schoolId: "school-b", campusId: "campus-b" }, [{ id: "e-b", campusId: "campus-b", classId: "c-b", subjectId: null }]);
  assert.deepEqual(own["e-b"], { subjectsCount: 1, studentsCount: 1, markedSubjects: 1, enteredMarks: 1, expectedMarks: 1 });
});

test("two campuses: a campus-bound user gets no progress for another campus's exam, and no query runs", async () => {
  const { db, calls } = fakeDb();
  const out = await examProgressFor(db, { ...admin, campusId: "campus-z" }, [examA]);
  assert.equal(out["e-1"], null);
  assert.equal(calls.length, 0);
});

test("the board asks for progress once and no longer sweeps /api/marks or double-refreshes on focus", () => {
  const board = readFileSync("src/components/academic/ExamCycleManager.tsx", "utf8");
  assert.doesNotMatch(board, /\/api\/marks\?examId/);
  assert.match(board, /withProgress=1/);
  assert.doesNotMatch(board, /addEventListener\("focus"/);
  assert.match(board, /if \(silent && inFlight\.current\) return;/);
  const route = readFileSync("src/app/api/exams/route.ts", "utf8");
  assert.match(route, /searchParams\.get\("withProgress"\) === "1"/);
  assert.match(route, /assertModuleRead\(user, "exams"\)/);
});

import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1830: analytics loaded every mark row (with its subject) and every report card (with its pupil)
// for the year. Marks are now summed per subject in the database, report cards are read without the
// pupil join, and names are fetched only for the pupils on the two lists. Every query stays school-scoped.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const exams = [
  { id: "e1", schoolId: "school-a", campusId: "campus-a", classId: "c-a", title: "Mid", term: "T1", examType: "MID_TERM" },
  { id: "e2", schoolId: "school-a", campusId: "campus-a", classId: "c-a", title: "Final", term: "T2", examType: "FINAL" },
  { id: "e3", schoolId: "school-a", campusId: "campus-a2", classId: "c-a2", title: "Mid", term: "T1", examType: "MID_TERM" },
  { id: "ex", schoolId: "school-b", campusId: "campus-b", classId: "c-b", title: "Mid", term: "T1", examType: "MID_TERM" },
];
const subjects = [
  { id: "math", schoolId: "school-a", name: "Maths", totalMarks: 50 },
  { id: "eng", schoolId: "school-a", name: "English", totalMarks: 100 },
  { id: "sci", schoolId: "school-b", name: "Science", totalMarks: 100 },
];
const mark = (schoolId: string, examId: string, subjectId: string, marksObtained: number) => ({ schoolId, examId, subjectId, marksObtained });
const marks = [
  mark("school-a", "e1", "math", 40), mark("school-a", "e1", "math", 30), mark("school-a", "e2", "eng", 81),
  mark("school-a", "e3", "eng", 10), mark("school-b", "ex", "sci", 90),
];
const card = (schoolId: string, examId: string, studentId: string, percentage: number) => ({
  schoolId, examId, studentId, percentage, grade: null, attendancePresent: 8, attendanceTotal: 10,
});
const cards = [
  card("school-a", "e1", "s1", 70), card("school-a", "e1", "s2", 40), card("school-a", "e2", "s1", 81),
  card("school-a", "e3", "s3", 20), card("school-b", "ex", "s9", 30),
];
const pupils = [
  { id: "s1", schoolId: "school-a", fullName: "Pupil One", rollNo: "1" },
  { id: "s2", schoolId: "school-a", fullName: "Pupil Two", rollNo: "2" },
  { id: "s3", schoolId: "school-a", fullName: "Pupil Three", rollNo: "3" },
  { id: "s9", schoolId: "school-b", fullName: "Pupil Nine", rollNo: "9" },
];

let user: { role: string; schoolId: string; campusId: string; denied?: boolean } = { role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
type W = { campusId?: string; campus?: { schoolId: string }; schoolId?: string; examId?: { in: string[] }; id?: { in: string[] } };
const calls: { model: string; args: { where: W; select?: Record<string, unknown> } }[] = [];
const record = (model: string, args: { where: W; select?: Record<string, unknown> }) => { calls.push({ model, args }); };
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  exam: { findMany: async ({ where }: { where: W }) => exams.filter((e) => (where.campusId ? e.campusId === where.campusId : e.schoolId === where.campus?.schoolId)) },
  reportCard: { findMany: async (args: { where: W; select: Record<string, unknown> }) => {
    record("reportCard", args);
    return cards.filter((c) => c.schoolId === args.where.schoolId && args.where.examId!.in.includes(c.examId));
  } },
  mark: {
    findMany: async () => { throw new Error("mark rows must not be loaded"); },
    groupBy: async (args: { where: W }) => {
      record("mark", args);
      const totals = new Map<string, { subjectId: string; _sum: { marksObtained: number }; _count: { _all: number } }>();
      for (const m of marks.filter((r) => r.schoolId === args.where.schoolId && args.where.examId!.in.includes(r.examId))) {
        const t = totals.get(m.subjectId) ?? { subjectId: m.subjectId, _sum: { marksObtained: 0 }, _count: { _all: 0 } };
        t._sum.marksObtained += m.marksObtained;
        t._count._all += 1;
        totals.set(m.subjectId, t);
      }
      return [...totals.values()];
    },
  },
  subject: { findMany: async (args: { where: W }) => {
    record("subject", args);
    return subjects.filter((s) => s.schoolId === args.where.schoolId && args.where.id!.in.includes(s.id));
  } },
  student: {
    count: async () => 3,
    findMany: async (args: { where: W }) => {
      record("student", args);
      return pupils.filter((p) => p.schoolId === args.where.schoolId && args.where.id!.in.includes(p.id));
    },
  },
  attendance: { groupBy: async () => [] },
  class: { findMany: async () => [] },
  gradeWeightConfig: { findMany: async () => [] },
} } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  assertModuleRead: async (u: typeof user) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  resolveCampusId: async (u: typeof user, requested: string | null) => requested ?? u.campusId,
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
} });
mock.module("@/lib/attendance/rule", { namedExports: { attendanceRuleFor: async () => ({}) } });
mock.module("@/lib/attendance", { namedExports: { groupedRuleRate: () => 0 } });

const get = async (query = "") => {
  calls.length = 0;
  const { GET } = await import("../../src/app/api/analytics/route");
  const res = await GET(new Request(`http://x/api/analytics${query}`));
  return { status: res.status, body: await res.json() };
};

test("subject averages come from per-subject database totals, scoped to the school and its exams", async () => {
  user = { role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
  const { body } = await get();
  // Maths: 70 of 2 x 50; English: 81 of 1 x 100. The other campus's English paper is not counted.
  assert.deepEqual(body.data.subjectPerformance, [
    { subject: "English", average: 81, entries: 1 },
    { subject: "Maths", average: 70, entries: 2 },
  ]);
  const markCall = calls.find((c) => c.model === "mark")!;
  assert.equal(markCall.args.where.schoolId, "school-a");
  assert.deepEqual(markCall.args.where.examId!.in, ["e1", "e2"]);
  const subjectCall = calls.find((c) => c.model === "subject")!;
  assert.deepEqual({ ...subjectCall.args.where, id: { in: [...subjectCall.args.where.id!.in].sort() } }, { id: { in: ["eng", "math"] }, schoolId: "school-a" });
});

test("report cards are read without the pupil join; names are fetched only for listed pupils", async () => {
  const { body } = await get();
  const cardCall = calls.find((c) => c.model === "reportCard")!;
  assert.equal(cardCall.args.where.schoolId, "school-a");
  assert.equal("student" in cardCall.args.select!, false);
  const studentCall = calls.find((c) => c.model === "student")!;
  assert.equal(studentCall.args.where.schoolId, "school-a");
  assert.deepEqual([...studentCall.args.where.id!.in].sort(), ["s1", "s2"]);
  assert.deepEqual(body.data.topStudents, [
    { name: "Pupil One", rollNo: "1", percentage: 81, grade: body.data.topStudents[0].grade },
    { name: "Pupil Two", rollNo: "2", percentage: 40, grade: body.data.topStudents[1].grade },
  ]);
  assert.deepEqual(body.data.atRiskStudents, [{ name: "Pupil Two", rollNo: "2", percentage: 40, attendancePct: 80 }]);
});

test("exam trends average each exam's own cards", async () => {
  const { body } = await get();
  assert.deepEqual(body.data.examTrends.map((t: { examId: string; average: number; students: number }) => [t.examId, t.average, t.students]), [
    ["e1", 55, 2],
    ["e2", 81, 1],
  ]);
  assert.equal(body.data.summary.avgPerformance, 63.7);
});

test("a second campus of the same school sees only its own exams", async () => {
  const { body } = await get("?campusId=campus-a2");
  assert.deepEqual(body.data.subjectPerformance, [{ subject: "English", average: 10, entries: 1 }]);
  assert.deepEqual(body.data.atRiskStudents.map((s: { rollNo: string }) => s.rollNo), ["3"]);
});

test("two schools stay isolated", async () => {
  user = { role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b" };
  const { body } = await get();
  assert.deepEqual(body.data.subjectPerformance, [{ subject: "Science", average: 90, entries: 1 }]);
  assert.deepEqual(body.data.atRiskStudents.map((s: { rollNo: string }) => s.rollNo), ["9"]);
  for (const c of calls) assert.equal(c.args.where.schoolId, "school-b", c.model);
});

test("a role without reports read is denied before any query", async () => {
  user = { role: "PARENT", schoolId: "school-a", campusId: "campus-a", denied: true };
  assert.equal((await get()).status, 403);
  assert.equal(calls.length, 0);
});

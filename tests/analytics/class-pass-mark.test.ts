import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1750: analytics used a hard-coded 50% pass mark, so a 45% pupil in a class that passes at 40%
// lowered the pass rate and was listed as at risk. It now uses each class's published pass mark.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const year = new Date().getFullYear();
const exams = [
  { id: "e-a", schoolId: "school-a", campusId: "campus-a", classId: "c-40", title: "Mid", term: "T1", examType: "MID_TERM" },
  { id: "e-b", schoolId: "school-a", campusId: "campus-a", classId: "c-def", title: "Mid", term: "T1", examType: "MID_TERM" },
  { id: "e-x", schoolId: "school-b", campusId: "campus-b", classId: "c-x", title: "Mid", term: "T1", examType: "MID_TERM" },
];
const card = (examId: string, studentId: string, percentage: number) => ({
  examId, studentId, percentage, grade: null, obtainedMarks: percentage, totalMarks: 100, attendancePresent: 0, attendanceTotal: 0,
  student: { fullName: `Pupil ${studentId}`, rollNo: studentId, classId: "" },
});
const cards = [card("e-a", "s1", 45), card("e-a", "s2", 35), card("e-b", "s3", 45), card("e-x", "s4", 45)];
const configs = [
  { schoolId: "school-a", classId: "c-40", academicYear: year, passingPercentage: 40 },
  // Same class id in another school must never leak its pass mark.
  { schoolId: "school-b", classId: "c-def", academicYear: year, passingPercentage: 10 },
  { schoolId: "school-b", classId: "c-x", academicYear: year, passingPercentage: 60 },
];
let user: { role: string; schoolId: string; campusId: string; denied?: boolean } = { role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
type W = { campusId?: string; examId?: { in: string[] }; classId?: { in: string[] }; schoolId?: string; academicYear?: number };
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  exam: { findMany: async ({ where }: { where: W }) => exams.filter((e) => e.campusId === where.campusId) },
  reportCard: { findMany: async ({ where }: { where: W }) => cards.filter((c) => where.examId!.in.includes(c.examId)) },
  mark: { findMany: async () => [] },
  student: { count: async () => 3 },
  attendance: { groupBy: async () => [] },
  class: { findMany: async () => [] },
  gradeWeightConfig: { findMany: async ({ where }: { where: W }) => configs.filter((c) => c.schoolId === where.schoolId && c.academicYear === where.academicYear && where.classId!.in.includes(c.classId)) },
} } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  assertModuleRead: async (u: typeof user) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  resolveCampusId: async (u: typeof user) => u.campusId,
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
} });
mock.module("@/lib/attendance/rule", { namedExports: { attendanceRuleFor: async () => ({}) } });
mock.module("@/lib/attendance", { namedExports: { groupedRuleRate: () => 0 } });

const get = async () => {
  const { GET } = await import("../../src/app/api/analytics/route");
  const res = await GET(new Request("http://x/api/analytics"));
  return { status: res.status, body: await res.json() };
};

test("a 45% pupil in a class that passes at 40% counts as passing and is not at risk", async () => {
  user = { role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
  const { body } = await get();
  const atRisk = body.data.atRiskStudents.map((s: { rollNo: string }) => s.rollNo);
  assert.ok(!atRisk.includes("s1"));
  assert.ok(atRisk.includes("s2"));
});

test("a class with no published rule keeps the 50% default", async () => {
  const { body } = await get();
  assert.deepEqual(body.data.atRiskStudents.map((s: { rollNo: string }) => s.rollNo).sort(), ["s2", "s3"]);
  assert.equal(body.data.summary.passRate, 33);
  assert.equal(body.data.summary.needsAttention, 2);
});

test("two schools stay isolated: each uses only its own pass marks", async () => {
  user = { role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b" };
  const { body } = await get();
  assert.deepEqual(body.data.atRiskStudents.map((s: { rollNo: string }) => s.rollNo), ["s4"]);
  assert.equal(body.data.summary.passRate, 0);
});

test("a role without reports read is denied", async () => {
  user = { role: "PARENT", schoolId: "school-a", campusId: "campus-a", denied: true };
  assert.equal((await get()).status, 403);
});

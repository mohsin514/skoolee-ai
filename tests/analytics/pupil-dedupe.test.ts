import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1752: analytics counted each report card as a pupil, so one pupil with two failing exams showed
// "2 of 1 students" and appeared twice in the insight lists. Counts and lists now use one (latest) result per pupil.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const exams = [
  { id: "e1", campusId: "campus-a", classId: "c-a", title: "T1", term: "T1", examType: "MID_TERM" },
  { id: "e2", campusId: "campus-a", classId: "c-a", title: "T2", term: "T2", examType: "FINAL" },
  { id: "ex", campusId: "campus-b", classId: "c-b", title: "T1", term: "T1", examType: "MID_TERM" },
];
const card = (examId: string, studentId: string, percentage: number) => ({
  examId, studentId, percentage, grade: null, obtainedMarks: percentage, totalMarks: 100, attendancePresent: 0, attendanceTotal: 0,
  student: { fullName: `Pupil ${studentId}`, rollNo: studentId, classId: "c-a" },
});
let cards = [card("e1", "s1", 30), card("e2", "s1", 40), card("ex", "s9", 20)];
let user: { role: string; schoolId: string; campusId: string; denied?: boolean } = { role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
type W = { campusId?: string; examId?: { in: string[] } };
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  exam: { findMany: async ({ where }: { where: W }) => exams.filter((e) => e.campusId === where.campusId) },
  reportCard: { findMany: async ({ where }: { where: W }) => cards.filter((c) => where.examId!.in.includes(c.examId)) },
  mark: { findMany: async () => [] },
  student: { count: async () => 1 },
  attendance: { groupBy: async () => [] },
  class: { findMany: async () => [] },
  gradeWeightConfig: { findMany: async () => [] },
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
const rolls = (list: { rollNo: string }[]) => list.map((s) => s.rollNo);

test("one pupil with two failing exams counts once and appears once per list, at their latest result", async () => {
  const { body } = await get();
  assert.equal(body.data.summary.needsAttention, 1);
  assert.deepEqual(rolls(body.data.atRiskStudents), ["s1"]);
  assert.deepEqual(rolls(body.data.topStudents), ["s1"]);
  assert.equal(body.data.atRiskStudents[0].percentage, 40);
});

test("distinct pupils are still each counted and ranked", async () => {
  cards = [card("e1", "s1", 30), card("e2", "s1", 80), card("e2", "s2", 45), card("ex", "s9", 20)];
  const { body } = await get();
  assert.equal(body.data.summary.needsAttention, 1);
  assert.equal(body.data.summary.passRate, 50);
  assert.deepEqual(rolls(body.data.topStudents), ["s1", "s2"]);
  assert.deepEqual(rolls(body.data.atRiskStudents), ["s2"]);
});

test("two schools stay isolated", async () => {
  user = { role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b" };
  const { body } = await get();
  assert.deepEqual(rolls(body.data.atRiskStudents), ["s9"]);
  assert.equal(body.data.summary.needsAttention, 1);
});

test("a role without reports read is denied", async () => {
  user = { role: "PARENT", schoolId: "school-a", campusId: "campus-a", denied: true };
  assert.equal((await get()).status, 403);
});

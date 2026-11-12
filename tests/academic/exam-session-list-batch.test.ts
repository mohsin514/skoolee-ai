import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1868: the exam sessions list polled every 45 seconds ran three queries per session. It now runs a fixed
// three, with the same school/campus/cancelledAt scope, and returns the same summaries as the per-session read.

type Where = Record<string, unknown>;
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

const exam = (id: string, name: string, section: string | null, status: string, subjects: number, students: number, marks: number, schedules: [string, number][]) => ({
  id, classId: `class-${id}`, status, totalMarks: subjects * 100,
  class: { name, section, _count: { subjects, students } },
  schedules: schedules.map(([date, seats], i) => ({ id: `${id}-sch-${i}`, date: day(date), _count: { seats } })),
  _count: { marks },
});
const session = (id: string, schoolId: string, campusId: string, academicYear: number, createdAt: string, exams: ReturnType<typeof exam>[]) => ({
  id, schoolId, campusId, academicYear, title: `Session ${id}`, term: "Term 1", examType: "MID_TERM",
  startDate: day("2026-03-01"), endDate: null, status: "PLANNING", notes: null, createdAt: new Date(createdAt), exams,
});

const sessions = [
  session("a1-old", "school-a", "campus-a1", 2025, "2025-02-01T00:00:00Z", [exam("e1", "Grade 6", "A", "PUBLISHED", 3, 20, 60, [["2025-03-04", 20], ["2025-03-02", 0]])]),
  session("a1-new", "school-a", "campus-a1", 2026, "2026-02-01T00:00:00Z", [
    exam("e2", "Grade 7", null, "ACTIVE", 2, 10, 5, [["2026-03-09", 0]]),
    exam("e3", "Grade 8", "B", "ACTIVE", 4, 0, 0, []),
  ]),
  session("a1-final", "school-a", "campus-a1", 2026, "2026-05-01T00:00:00Z", []),
  session("a2-only", "school-a", "campus-a2", 2026, "2026-02-01T00:00:00Z", [exam("e4", "Grade 9", null, "ACTIVE", 1, 1, 1, [["2026-04-01", 1]])]),
  session("b1-only", "school-b", "campus-b1", 2026, "2026-02-01T00:00:00Z", [exam("e5", "Grade 1", null, "ACTIVE", 1, 1, 0, [])]),
];
const slots = [
  { schoolId: "school-a", campusId: "campus-a1", examSessionId: "a1-new", sealedAt: null, paperRecordId: "p-approved", cancelledAt: null },
  { schoolId: "school-a", campusId: "campus-a1", examSessionId: "a1-new", sealedAt: null, paperRecordId: "p-draft", cancelledAt: null },
  { schoolId: "school-a", campusId: "campus-a1", examSessionId: "a1-new", sealedAt: day("2026-03-01"), paperRecordId: null, cancelledAt: null },
  { schoolId: "school-a", campusId: "campus-a1", examSessionId: "a1-new", sealedAt: null, paperRecordId: "p-approved", cancelledAt: day("2026-03-02") },
  { schoolId: "school-a", campusId: "campus-a1", examSessionId: "a1-old", sealedAt: null, paperRecordId: "p-other-campus", cancelledAt: null },
  { schoolId: "school-a", campusId: "campus-a2", examSessionId: "a2-only", sealedAt: null, paperRecordId: "p-a2", cancelledAt: null },
  { schoolId: "school-b", campusId: "campus-b1", examSessionId: "b1-only", sealedAt: null, paperRecordId: "p-b", cancelledAt: null },
];
const papers = [
  { id: "p-approved", schoolId: "school-a", campusId: "campus-a1", kind: "PAPER", status: "APPROVED" },
  { id: "p-draft", schoolId: "school-a", campusId: "campus-a1", kind: "PAPER", status: "DRAFT" },
  { id: "p-other-campus", schoolId: "school-a", campusId: "campus-a2", kind: "PAPER", status: "APPROVED" },
  { id: "p-a2", schoolId: "school-a", campusId: "campus-a2", kind: "PAPER", status: "APPROVED" },
  { id: "p-b", schoolId: "school-b", campusId: "campus-b1", kind: "PAPER", status: "APPROVED" },
];

const queries: { model: string; where: Where }[] = [];
const inList = (value: unknown, cond: unknown) => (cond && typeof cond === "object" && "in" in cond ? (cond as { in: unknown[] }).in.includes(value) : value === cond);
const matches = (row: Record<string, unknown>, where: Where) => Object.entries(where).every(([k, cond]) => inList(row[k], cond));
const pick = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row);

const prisma = {
  examSession: {
    findMany: async (args: { where: Where }) => {
      queries.push({ model: "examSession.findMany", where: args.where });
      return sessions.filter((s) => matches(s, args.where)).sort((a, b) => b.academicYear - a.academicYear || +b.createdAt - +a.createdAt);
    },
    findFirst: async (args: { where: Where }) => {
      queries.push({ model: "examSession.findFirst", where: args.where });
      return sessions.find((s) => matches(s, args.where)) ?? null;
    },
  },
  examPaperSlot: {
    findMany: async (args: { where: Where; select?: Record<string, boolean> }) => {
      queries.push({ model: "examPaperSlot.findMany", where: args.where });
      return slots.filter((s) => matches(s, args.where)).map((s) => pick(s, args.select));
    },
  },
  schoolAiRecord: {
    findMany: async (args: { where: Where; select?: Record<string, boolean> }) => {
      queries.push({ model: "schoolAiRecord.findMany", where: args.where });
      return papers.filter((p) => matches(p, args.where)).map((p) => pick(p, args.select));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
let user: User = { userId: "u-office", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => user,
    assertSharedModuleRead: async (u: User) => { if (u.role === "ACCOUNTANT") throw new ApiError("Insufficient permissions", 403); },
    resolveCampusId: async (u: User) => u.campusId,
    canManageOperations: () => false,
    assertPermission: async () => undefined,
    errorResponse: (error: unknown) => Response.json({ success: false }, { status: error instanceof ApiError ? error.status : 500 }),
  },
});
mock.module("@/lib/academic/exam-scheduling-write", { namedExports: { withExamSchedulingWrite: async () => undefined, resolveExamSchedulingCampus: async () => undefined } });
mock.module("@/lib/notifications/in-app", { namedExports: { notify: async () => undefined } });

const lib = () => import("@/lib/academic/exam-sessions");

test("one campus's list costs three queries however many sessions it has, scoped to its school and campus", async () => {
  const { listSessions } = await lib();
  queries.length = 0;
  const list = await listSessions("campus-a1");
  assert.deepEqual(list.map((s) => s.id), ["a1-final", "a1-new", "a1-old"]);
  assert.deepEqual(queries.map((q) => q.model), ["examSession.findMany", "examPaperSlot.findMany", "schoolAiRecord.findMany"]);
  assert.deepEqual(queries[0].where, { campusId: "campus-a1" });
  assert.deepEqual(queries[1].where, { schoolId: "school-a", examSessionId: { in: ["a1-final", "a1-new", "a1-old"] }, campusId: "campus-a1", cancelledAt: null });
  assert.deepEqual(queries[2].where, { schoolId: "school-a", id: { in: ["p-approved", "p-draft", "p-other-campus"] }, campusId: "campus-a1", kind: "PAPER", status: "APPROVED" });

  const fresh = list.find((s) => s.id === "a1-new")!;
  assert.equal(fresh.paperSlots, 3, "the cancelled request is not counted");
  assert.equal(fresh.papersSealed, 2, "sealed, or its paper approved on this campus");
  assert.equal(list.find((s) => s.id === "a1-old")!.papersSealed, 0, "a paper approved on another campus does not count");
  assert.deepEqual([fresh.classCount, fresh.papersExpected, fresh.marksExpected, fresh.firstDate, fresh.lastDate], [2, 6, 20, "2026-03-09", "2026-03-09"]);
  const old = list.find((s) => s.id === "a1-old")!;
  assert.deepEqual([old.papersScheduled, old.papersSeated, old.publishedCount, old.firstDate, old.lastDate], [2, 1, 1, "2025-03-02", "2025-03-04"]);
});

test("the batched list matches the per-session summary for every session", async () => {
  const { listSessions, getSessionSummary } = await lib();
  for (const campusId of ["campus-a1", "campus-a2", "campus-b1"]) {
    const list = await listSessions(campusId);
    const one = await Promise.all(list.map((s) => getSessionSummary(campusId, s.id)));
    assert.deepEqual(list, one);
  }
});

test("a second campus and a second school see only their own sessions and requests", async () => {
  const { listSessions } = await lib();
  queries.length = 0;
  const a2 = await listSessions("campus-a2");
  assert.deepEqual(a2.map((s) => [s.id, s.paperSlots, s.papersSealed]), [["a2-only", 1, 1]]);
  const b1 = await listSessions("campus-b1");
  assert.deepEqual(b1.map((s) => [s.id, s.paperSlots, s.papersSealed]), [["b1-only", 1, 1]]);
  assert.ok(queries.filter((q) => !q.model.startsWith("examSession.")).every((q) => q.where.schoolId && q.where.campusId), "every slot and paper read keeps school and campus");
  assert.equal((await listSessions("campus-a1", 2025)).length, 1, "an explicit year still filters");
  assert.deepEqual(await listSessions("campus-none"), []);
});

test("the route keeps its gate: a denied role reads nothing", async () => {
  const { GET } = await import("@/app/api/academic/exam-sessions/route");
  const req = (url: string) => ({ nextUrl: new URL(url) }) as never;
  user = { userId: "u-acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };
  queries.length = 0;
  const denied = await GET(req("https://school.test/api/academic/exam-sessions"));
  assert.equal(denied.status, 403);
  assert.equal(queries.length, 0);

  user = { userId: "u-b", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" };
  const ok = await GET(req("https://school.test/api/academic/exam-sessions?campusId=campus-a1"));
  const body = await ok.json();
  assert.deepEqual(body.data.map((s: { id: string }) => s.id), ["b1-only"], "the campus comes from the caller, not the query");
});

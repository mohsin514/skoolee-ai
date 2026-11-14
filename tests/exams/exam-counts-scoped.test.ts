import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1965: exam lists used a relation `_count`, which Prisma 6 runs as an aggregate over every school's marks
// and report cards. Counts now come from groupBy reads limited to the caller's school and the listed ids, and
// the response keeps the same `_count` shape.

type Where = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };

const exams = [
  { id: "ex-a1", schoolId: "school-a", campusId: "campus-a1", status: "MARKS_ENTRY", examType: "QUIZ", isLocked: false, classId: "c-a1" },
  { id: "ex-a2", schoolId: "school-a", campusId: "campus-a1", status: "ACTIVE", examType: "QUIZ", isLocked: false, classId: "c-a1" },
  { id: "ex-a3", schoolId: "school-a", campusId: "campus-a2", status: "ACTIVE", examType: "QUIZ", isLocked: false, classId: "c-a2" },
  { id: "ex-b1", schoolId: "school-b", campusId: "campus-b1", status: "ACTIVE", examType: "QUIZ", isLocked: false, classId: "c-b1" },
];
const marks = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `m-a1-${i}`, schoolId: "school-a", examId: "ex-a1", subjectId: "s-a1" })),
  { id: "m-a3", schoolId: "school-a", examId: "ex-a3", subjectId: "s-a3" },
  // A second school's marks on a colliding exam id must never be counted for school A.
  { id: "m-b-collide", schoolId: "school-b", examId: "ex-a2", subjectId: "s-b1" },
];
const reportCards = [{ schoolId: "school-a", examId: "ex-a1" }, { schoolId: "school-b", examId: "ex-b1" }];
const schedules = [{ schoolId: "school-a", examId: "ex-a1" }, { schoolId: "school-a", examId: "ex-a1" }, { schoolId: "school-a", examId: "ex-a2" }];

const queries: { model: string; args: Record<string, unknown> }[] = [];
const hit = (value: unknown, cond: unknown) => (cond && typeof cond === "object" && "in" in cond ? (cond as { in: unknown[] }).in.includes(value) : value === cond);
const matches = (row: Record<string, unknown>, where: Where) => Object.entries(where).every(([k, cond]) => hit(row[k], cond));
const groupBy = (model: string, rows: Record<string, unknown>[]) => async (args: { by: string[]; where: Where }) => {
  queries.push({ model: `${model}.groupBy`, args });
  const counts = new Map<unknown, number>();
  for (const row of rows.filter((r) => matches(r, args.where))) counts.set(row[args.by[0]], (counts.get(row[args.by[0]]) ?? 0) + 1);
  return [...counts].map(([key, n]) => ({ [args.by[0]]: key, _count: { _all: n } }));
};

let user: User = { userId: "u-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
const db = {
  exam: {
    findMany: async (args: { where: { campus: { schoolId: string; id?: string } }; include: Record<string, unknown> }) => {
      queries.push({ model: "exam.findMany", args });
      const { schoolId, id } = args.where.campus;
      return exams.filter((e) => e.schoolId === schoolId && (!id || e.campusId === id));
    },
    findUnique: async (args: { where: { id: string }; include?: unknown }) => {
      queries.push({ model: "exam.findUnique", args });
      return exams.find((e) => e.id === args.where.id && e.schoolId === user.schoolId) ?? null;
    },
  },
  mark: {
    groupBy: groupBy("mark", marks),
    findFirst: async (args: { where: Where }) => {
      queries.push({ model: "mark.findFirst", args });
      return marks.find((m) => matches(m, args.where)) ?? null;
    },
  },
  reportCard: { groupBy: groupBy("reportCard", reportCards) },
  examSchedule: { groupBy: groupBy("examSchedule", schedules) },
  examSeat: { groupBy: groupBy("examSeat", []) },
  academicCycle: { findFirst: async () => null },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => user } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    canLeadAcademics: async () => false,
    assertModuleRead: async () => undefined,
    assertSharedModuleRead: async (u: User) => {
      if (u.role === "ACCOUNTANT") throw Object.assign(new Error("Insufficient permissions"), { status: 403 });
    },
  },
});
mock.module("@/lib/billing/response", { namedExports: { billingAccessResponse: async () => null } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => undefined } });

const route = () => import("@/app/api/exams/route");
const reset = (next: User) => { user = next; queries.length = 0; };

test("the helper counts only the listed ids in the caller's school and skips empty lists", async () => {
  const { examCounts, marksBySubject } = await import("@/lib/academic/exam-counts");
  reset(user);
  const none = await examCounts(db as never, "school-a", [], ["marks", "reportCards"] as const);
  assert.deepEqual(none("anything"), { marks: 0, reportCards: 0 });
  assert.equal(queries.length, 0, "no ids, no query");

  const countFor = await examCounts(db as never, "school-a", ["ex-a1", "ex-a2", "ex-a1"], ["marks", "reportCards"] as const);
  assert.deepEqual(countFor("ex-a1"), { marks: 3, reportCards: 1 });
  assert.deepEqual(countFor("ex-a2"), { marks: 0, reportCards: 0 }, "school B's mark on a colliding id is not counted");
  assert.deepEqual(queries.map((q) => q.args.where), [
    { schoolId: "school-a", examId: { in: ["ex-a1", "ex-a2"] } },
    { schoolId: "school-a", examId: { in: ["ex-a1", "ex-a2"] } },
  ]);
  const bySubject = await marksBySubject(db as never, "school-a", ["s-a1", "s-b1"]);
  assert.deepEqual([bySubject("s-a1"), bySubject("s-b1")], [3, 0]);
});

test("GET /api/exams returns the same _count shape without a relation _count, per school and campus", async () => {
  const { GET } = await route();
  reset({ userId: "u-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const res = await GET(new Request("https://school.test/api/exams?campusId=campus-a1") as never);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.exams.map((e: { id: string; _count: unknown }) => [e.id, e._count]), [
    ["ex-a1", { marks: 3, reportCards: 1, schedules: 2 }],
    ["ex-a2", { marks: 0, reportCards: 0, schedules: 1 }],
  ]);
  const list = queries.find((q) => q.model === "exam.findMany")!;
  assert.equal("_count" in (list.args.include as object), false, "no relation _count on the list read");
  assert.ok(queries.filter((q) => q.model.endsWith(".groupBy")).every((q) => (q.args.where as Where).schoolId === "school-a"));

  reset({ userId: "u-a2", role: "ADMIN", schoolId: "school-a", campusId: "campus-a2" });
  const a2 = await (await GET(new Request("https://school.test/api/exams?campusId=campus-a2") as never)).json();
  assert.deepEqual(a2.exams.map((e: { id: string; _count: unknown }) => [e.id, e._count]), [["ex-a3", { marks: 1, reportCards: 0, schedules: 0 }]]);

  reset({ userId: "u-b", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" });
  const b = await (await GET(new Request("https://school.test/api/exams?campusId=campus-b1") as never)).json();
  assert.deepEqual(b.exams.map((e: { id: string; _count: unknown }) => [e.id, e._count]), [["ex-b1", { marks: 0, reportCards: 1, schedules: 0 }]]);
  assert.ok(queries.filter((q) => q.model.endsWith(".groupBy")).every((q) => (q.args.where as Where).schoolId === "school-b"));

  reset({ userId: "u-acc", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" });
  const denied = await GET(new Request("https://school.test/api/exams?campusId=campus-a1") as never);
  assert.notEqual(denied.status, 200);
  assert.equal(queries.length, 0, "a denied role reads nothing");
});

test("PATCH keeps the draft guard: an exam with marks cannot return to draft", async () => {
  const { PATCH } = await route();
  reset({ userId: "u-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const res = await PATCH(new Request("https://school.test/api/exams", { method: "PATCH", body: JSON.stringify({ id: "ex-a1", status: "DRAFT" }) }) as never);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /marks cannot return to draft/);
  assert.equal("include" in (queries.find((q) => q.model === "exam.findUnique")!.args), false, "no relation _count on the lookup");
  assert.deepEqual(queries.find((q) => q.model === "mark.findFirst")!.args.where, { schoolId: "school-a", examId: "ex-a1" });
});

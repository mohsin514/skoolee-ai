import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1965: the session planner's master date sheet (GET /api/academic/exam-schedule/bulk) counted each
// paper's rooms and seats with a relation `_count`, which Prisma 6 runs as an aggregate over every school's
// exam_rooms and exam_seats. It now counts with groupBy reads limited to the caller's school and the listed
// schedule ids, and the planning grid keeps the same roomCount/seatCount values.

type Where = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };

const sessions = [
  { id: "sess-a1", campusId: "campus-a1", title: "Mid A1" },
  { id: "sess-a2", campusId: "campus-a2", title: "Mid A2" },
  { id: "sess-b1", campusId: "campus-b1", title: "Mid B1" },
];
const subjects = (prefix: string) => [
  { id: `${prefix}-maths`, name: "Maths", totalMarks: 100 },
  { id: `${prefix}-science`, name: "Science", totalMarks: 50 },
];
const sched = (id: string, subjectId: string, date: string) => ({ id, subjectId, date: new Date(`${date}T00:00:00Z`), periodDefinitionId: "p1", roomId: null });
const exams = [
  { id: "ex-a1", sessionId: "sess-a1", campusId: "campus-a1", classId: "c-a1", class: { name: "Grade 6", section: "A", subjects: subjects("a1"), _count: { students: 30 } },
    schedules: [sched("sch-a1", "a1-maths", "2026-03-02"), sched("sch-a2", "a1-science", "2026-03-03")] },
  { id: "ex-a3", sessionId: "sess-a2", campusId: "campus-a2", classId: "c-a2", class: { name: "Grade 7", section: null, subjects: subjects("a2"), _count: { students: 12 } },
    schedules: [sched("sch-a3", "a2-maths", "2026-03-04")] },
  { id: "ex-b1", sessionId: "sess-b1", campusId: "campus-b1", classId: "c-b1", class: { name: "Grade 6", section: "A", subjects: subjects("b1"), _count: { students: 9 } },
    schedules: [sched("sch-b1", "b1-maths", "2026-03-02")] },
];
// School B reuses school A's schedule ids, so a missing school filter would inflate school A's counts.
const examRooms = [
  { schoolId: "school-a", examScheduleId: "sch-a1" },
  { schoolId: "school-a", examScheduleId: "sch-a1" },
  { schoolId: "school-a", examScheduleId: "sch-a3" },
  { schoolId: "school-b", examScheduleId: "sch-a2" },
  { schoolId: "school-b", examScheduleId: "sch-b1" },
];
const seats = [
  ...Array.from({ length: 5 }, () => ({ schoolId: "school-a", examScheduleId: "sch-a1" })),
  ...Array.from({ length: 3 }, () => ({ schoolId: "school-a", examScheduleId: "sch-a3" })),
  ...Array.from({ length: 7 }, () => ({ schoolId: "school-b", examScheduleId: "sch-a2" })),
  { schoolId: "school-b", examScheduleId: "sch-b1" },
];

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
  examSession: {
    findFirst: async (args: { where: Where }) => {
      queries.push({ model: "examSession.findFirst", args });
      const s = sessions.find((row) => matches(row, args.where));
      return s ? { id: s.id, title: s.title, startDate: null, endDate: null } : null;
    },
  },
  exam: {
    findMany: async (args: { where: Where; select: Record<string, unknown> }) => {
      queries.push({ model: "exam.findMany", args });
      return exams.filter((e) => matches(e, args.where)).map(({ id, classId, class: cls, schedules }) => ({ id, classId, class: cls, schedules }));
    },
  },
  holiday: { findMany: async () => [] },
  periodDefinition: { findMany: async () => [] },
  examSeat: { groupBy: groupBy("examSeat", seats) },
  examRoom: { groupBy: groupBy("examRoom", examRooms) },
};

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => user,
    assertStaffRole: (u: User) => { if (u.role === "PARENT") throw new ApiError("Insufficient permissions", 403); },
    assertPermission: async () => undefined,
    canManageOperations: () => true,
    errorResponse: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
  },
});
mock.module("@/lib/academic/exam-scheduling-write", {
  namedExports: {
    withExamSchedulingWrite: async () => { throw new Error("not used by GET"); },
    // Campus is the caller's own; the route then filters the session and exams by it.
    resolveExamSchedulingCampus: async (u: User) => u.campusId,
  },
});
mock.module("@/lib/academic/exam-bookings", { namedExports: { assertExamReservations: async () => undefined, validateStoredExamSchedules: async () => undefined } });
mock.module("@/lib/locale/store", { namedExports: { loadCampusLocaleTimeline: async () => () => ({ weekend: [] }), loadLocaleTimeline: async () => () => ({ weekend: [] }) } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanFeature: async () => undefined } });

const reset = (next: User) => { user = next; queries.length = 0; };
const get = async (sessionId: string) => {
  const { GET } = await import("@/app/api/academic/exam-schedule/bulk/route");
  const res = await GET({ nextUrl: new URL(`https://school.test/api/academic/exam-schedule/bulk?sessionId=${sessionId}`) } as never);
  return { status: res.status, body: await res.json() };
};
type Paper = { scheduleId: string | null; roomCount: number; seatCount: number };
type Row = { examId: string; studentCount: number; papers: Paper[] };
const counts = (body: { data?: { rows: Row[] }; rows?: Row[] }) =>
  ((body.data ?? body).rows as Row[]).flatMap((row) => row.papers.map((p) => [p.scheduleId, p.roomCount, p.seatCount]));

test("bulk date sheet counts rooms and seats per paper in the caller's school, with no relation _count", async () => {
  reset({ userId: "u-a", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" });
  const a1 = await get("sess-a1");
  assert.equal(a1.status, 200);
  assert.deepEqual(counts(a1.body), [["sch-a1", 2, 5], ["sch-a2", 0, 0]], "school B's rooms and seats on sch-a2 are not counted");
  const read = queries.find((q) => q.model === "exam.findMany")!;
  const scheduleSelect = ((read.args.select as { schedules: { select: Record<string, unknown> } }).schedules).select;
  assert.equal("_count" in scheduleSelect, false, "no relation _count on the schedules read");
  assert.deepEqual(queries.filter((q) => q.model.endsWith(".groupBy")).map((q) => [q.model, q.args.where]), [
    ["examSeat.groupBy", { schoolId: "school-a", examScheduleId: { in: ["sch-a1", "sch-a2"] } }],
    ["examRoom.groupBy", { schoolId: "school-a", examScheduleId: { in: ["sch-a1", "sch-a2"] } }],
  ]);
});

test("a second campus and a second school see only their own counts; a denied role reads nothing", async () => {
  reset({ userId: "u-a2", role: "ADMIN", schoolId: "school-a", campusId: "campus-a2" });
  assert.deepEqual(counts((await get("sess-a2")).body), [["sch-a3", 1, 3], [null, 0, 0]]);
  reset({ userId: "u-a2", role: "ADMIN", schoolId: "school-a", campusId: "campus-a2" });
  assert.equal((await get("sess-a1")).status, 404, "another campus's session is not found");
  assert.equal(queries.some((q) => q.model.endsWith(".groupBy")), false);

  reset({ userId: "u-b", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" });
  assert.deepEqual(counts((await get("sess-b1")).body), [["sch-b1", 1, 1], [null, 0, 0]]);
  assert.ok(queries.filter((q) => q.model.endsWith(".groupBy")).every((q) => (q.args.where as Where).schoolId === "school-b"));

  reset({ userId: "u-p", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" });
  assert.equal((await get("sess-a1")).status, 403);
  assert.equal(queries.length, 0, "a denied role reads nothing");
});

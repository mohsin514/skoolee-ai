import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { classPeriodEditDecision, findPeriodOverlap, periodInputProblem } from "../../src/lib/academic/period-rules";

// SKAI-146: period setup — overlap/validation rules and how edits treat timetables built on a period.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

type Period = { id: string; schoolId: string; campusId: string; timeType: string; periodNumber: number; startTime: string; endTime: string };
type Slot = { id: string; schoolId: string; timetableId: string; periodNumber: number; startTime: string; endTime: string };
type Timetable = { id: string; schoolId: string; campusId: string; status: string; draftRevision: number };
const db: { periods: Period[]; slots: Slot[]; timetables: Timetable[] } = { periods: [], slots: [], timetables: [] };
let user = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };

const match = (row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (key === "timetable") return db.timetables.some((t): boolean => t.id === row.timetableId && match(t, value as Record<string, unknown>));
    if (value && typeof value === "object" && "in" in (value as object)) return (value as { in: unknown[] }).in.includes(row[key]);
    return row[key] === value;
  });
const slotView = (s: Slot) => ({ ...s, timetable: db.timetables.find((t) => t.id === s.timetableId)! });
const tx = {
  periodDefinition: {
    findUnique: async ({ where }: any) => db.periods.find((p) => match(p, where.campusId_timeType_periodNumber)) ?? null,
    findFirst: async ({ where }: any) => db.periods.find((p) => match(p, where)) ?? null,
    findMany: async ({ where }: any) => db.periods.filter((p) => match(p, where)),
    create: async ({ data }: any) => { const row = { id: `p${db.periods.length + 1}`, schoolId: user.schoolId, ...data }; db.periods.push(row); return row; },
    update: async ({ where, data }: any) => Object.assign(db.periods.find((p) => p.id === where.id)!, data),
    delete: async ({ where }: any) => { db.periods = db.periods.filter((p) => p.id !== where.id); },
  },
  timetableSlot: {
    findMany: async ({ where }: any) => db.slots.filter((s) => match(s, where)).map(slotView),
    updateMany: async ({ where, data }: any) => { db.slots.filter((s) => match(s, where)).forEach((s) => Object.assign(s, data)); },
  },
  timetable: {
    updateMany: async ({ where }: any) => { db.timetables.filter((t) => match(t, where)).forEach((t) => { t.draftRevision += 1; }); },
  },
  examSchedule: { count: async () => 0, findMany: async () => [] },
};

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => user,
    canManageCampusOps: (u: typeof user) => u.role !== "TEACHER",
    assertPermission: async () => undefined,
    resolveCampusId: async (u: typeof user, requested?: string | null) => {
      if (requested && requested !== u.campusId) throw new ApiError("Campus not accessible", 403);
      return u.campusId;
    },
    errorResponse: (error: unknown) => error instanceof ApiError
      ? Response.json({ error: error.message, code: error.code }, { status: error.status })
      : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: tx } });
mock.module(src("lib/academic/exam-bookings.ts"), { namedExports: { validateStoredExamSchedules: async () => undefined } });
mock.module(src("lib/academic/resource-write.ts"), {
  namedExports: {
    resourceScope: (u: typeof user) => ({ schoolId: u.schoolId, campusId: u.campusId }),
    withSchedulingResourceWrite: async (_u: unknown, _c: string, _r: string, _a: string, fn: (t: typeof tx) => Promise<Response>) => fn(tx),
  },
});

const route = () => import("../../src/app/api/academic/periods/route");
const call = async (method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, query = "") => {
  const { NextRequest } = await import("next/server");
  const handler = (await route())[method] as (req: InstanceType<typeof NextRequest>) => Promise<Response>;
  const res = await handler(new NextRequest(`http://test/api/academic/periods${query}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) }));
  return { status: res.status, json: await res.json() };
};

beforeEach(() => {
  user = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
  db.periods = [
    { id: "a1", schoolId: "school-a", campusId: "campus-a", timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" },
    { id: "a2", schoolId: "school-a", campusId: "campus-a", timeType: "CLASS", periodNumber: 2, startTime: "08:40", endTime: "09:20" },
    { id: "a3", schoolId: "school-a", campusId: "campus-a", timeType: "CLASS", periodNumber: 3, startTime: "09:40", endTime: "10:20" },
    { id: "b1", schoolId: "school-a", campusId: "campus-b", timeType: "CLASS", periodNumber: 1, startTime: "07:30", endTime: "08:10" },
    { id: "x1", schoolId: "school-b", campusId: "campus-x", timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" },
  ];
  db.timetables = [
    { id: "t1", schoolId: "school-a", campusId: "campus-a", status: "PUBLISHED", draftRevision: 3 },
    { id: "tb", schoolId: "school-a", campusId: "campus-b", status: "DRAFT", draftRevision: 1 },
    { id: "tx", schoolId: "school-b", campusId: "campus-x", status: "DRAFT", draftRevision: 1 },
  ];
  db.slots = [
    { id: "s1", schoolId: "school-a", timetableId: "t1", periodNumber: 2, startTime: "08:40", endTime: "09:20" },
    { id: "sb", schoolId: "school-a", timetableId: "tb", periodNumber: 2, startTime: "08:40", endTime: "09:20" },
    { id: "sx", schoolId: "school-b", timetableId: "tx", periodNumber: 2, startTime: "08:40", endTime: "09:20" },
  ];
});

test("rules: back-to-back periods are fine, overlaps and bad input are reported", () => {
  const rows = [{ id: "1", periodNumber: 1, startTime: "08:00", endTime: "08:40" }];
  assert.equal(findPeriodOverlap(rows, "08:40", "09:20"), undefined);
  assert.equal(findPeriodOverlap(rows, "08:30", "09:00")?.periodNumber, 1);
  assert.equal(findPeriodOverlap(rows, "08:30", "09:00", "1"), undefined);
  assert.equal(periodInputProblem(0, "08:00", "08:40"), "periodNumber must be >= 1");
  assert.equal(periodInputProblem(1, "8:00", "08:40"), "startTime/endTime must be HH:mm");
  assert.equal(periodInputProblem(1, "09:00", "09:00"), "endTime must be after startTime");
  assert.equal(periodInputProblem(1, "09:00", "09:40"), null);
});

test("rules: edit decision depends on timetable use", () => {
  const used = { slots: 2, timetables: 1, published: 1 };
  assert.equal(classPeriodEditDecision({ impact: { slots: 0, timetables: 0, published: 0 }, renumbered: true, timesShifted: true, applyToTimetables: false }), "ok");
  assert.equal(classPeriodEditDecision({ impact: used, renumbered: true, timesShifted: false, applyToTimetables: true }), "blocked-renumber");
  assert.equal(classPeriodEditDecision({ impact: used, renumbered: false, timesShifted: true, applyToTimetables: false }), "confirm");
  assert.equal(classPeriodEditDecision({ impact: used, renumbered: false, timesShifted: true, applyToTimetables: true }), "apply");
});

test("POST rejects overlap and duplicate number, accepts a break-separated period", async () => {
  assert.equal((await call("POST", { periodNumber: 4, startTime: "10:00", endTime: "10:30" })).status, 409);
  assert.equal((await call("POST", { periodNumber: 3, startTime: "11:00", endTime: "11:40" })).status, 409);
  const ok = await call("POST", { periodNumber: 4, startTime: "10:40", endTime: "11:20" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.campusId, "campus-a");
});

test("a time change on a period in use needs confirmation, then moves only this campus's slots", async () => {
  const first = await call("PATCH", { id: "a2", startTime: "08:45", endTime: "09:25" });
  assert.equal(first.status, 409);
  assert.equal(first.json.code, "PERIOD_TIMETABLE_CONFIRM");
  assert.equal(db.periods.find((p) => p.id === "a2")!.startTime, "08:40", "nothing changes before confirmation");

  const applied = await call("PATCH", { id: "a2", startTime: "08:45", endTime: "09:25", applyToTimetables: true });
  assert.equal(applied.status, 200);
  assert.match(applied.json.warning, /Republish 1 timetable/);
  assert.deepEqual(db.slots.map((s) => [s.id, s.startTime]), [["s1", "08:45"], ["sb", "08:40"], ["sx", "08:40"]]);
  assert.equal(db.timetables.find((t) => t.id === "t1")!.draftRevision, 4);
  assert.equal(db.timetables.find((t) => t.id === "tb")!.draftRevision, 1);
});

test("renumbering or deleting a period in use is refused; unused periods delete", async () => {
  const renumber = await call("PATCH", { id: "a2", periodNumber: 5 });
  assert.equal(renumber.json.code, "PERIOD_IN_USE");
  const del = await call("DELETE", undefined, "?id=a2");
  assert.equal(del.status, 409);
  assert.equal(del.json.code, "PERIOD_IN_USE");
  assert.equal((await call("DELETE", undefined, "?id=a3")).status, 200);
  assert.equal(db.periods.some((p) => p.id === "a3"), false);
});

test("another school's or campus's period cannot be read, edited or deleted", async () => {
  const list = await call("GET");
  assert.deepEqual(list.json.data.map((p: Period) => p.id).sort(), ["a1", "a2", "a3"]);
  assert.equal((await call("GET", undefined, "?campusId=campus-x")).status, 403);
  assert.equal((await call("PATCH", { id: "x1", startTime: "09:00" })).status, 404);
  assert.equal((await call("PATCH", { id: "b1", startTime: "07:00" })).status, 404);
  assert.equal((await call("DELETE", undefined, "?id=x1")).status, 404);
});

test("a teacher is denied every write", async () => {
  user = { ...user, role: "TEACHER" };
  assert.equal((await call("POST", { periodNumber: 9, startTime: "13:00", endTime: "13:40" })).status, 403);
  assert.equal((await call("PATCH", { id: "a1", startTime: "07:50" })).status, 403);
  assert.equal((await call("DELETE", undefined, "?id=a3")).status, 403);
  assert.equal(db.periods.length, 5);
});

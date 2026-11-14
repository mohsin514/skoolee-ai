/**
 * SKAI-1983: the year-end panel reads every class average in one request instead of one full grade sheet per class.
 * The summary keeps the per-class route's gates (signed in, exams read, a campus), reads only the caller's campus
 * (two schools, two campuses), and returns averages only: no per-student rows or roll numbers.
 */
import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";

class ApiError extends Error { code?: string; constructor(message: string, public status: number) { super(message); } }
class ValidationError extends ApiError {}
const errorResponse = (error: unknown) => Response.json({ error: (error as Error).message }, { status: (error as ApiError).status ?? 500 });
type User = { userId: string; role: string; schoolId: string; campusId: string | null };
const state = { user: null as User | null, classWheres: [] as Record<string, any>[], calc: [] as Array<[string, string, number]> };
const classes = [
  { id: "class-a1", campusId: "campus-a" }, { id: "class-a2", campusId: "campus-a" }, { id: "class-a3", campusId: "campus-a" },
  { id: "class-b1", campusId: "campus-b" }, { id: "class-x1", campusId: "campus-x" },
];

mock.module("@/lib/db/prisma", { namedExports: { prisma: { class: { findMany: async ({ where }: { where: Record<string, any> }) => {
  state.classWheres.push(where);
  return classes.filter((c) => where.id.in.includes(c.id) && c.campusId === where.campusId).map(({ id }) => ({ id }));
} } } } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError, ValidationError, errorResponse,
  requireAuthUser: async () => { if (!state.user) throw new ApiError("Unauthorized", 401); return state.user; },
  assertModuleRead: async (user: User) => { if (["PARENT", "STUDENT"].includes(user.role)) throw new ApiError("Forbidden", 403); },
} });
mock.module("@/lib/academic/grade-calculator", { namedExports: { calculateWeightedGradeForClass: async (classId: string, campusId: string, year: number) => {
  state.calc.push([classId, campusId, year]);
  if (classId === "class-a2") return [];
  return [{ studentId: "s1", overallPercentage: 80 }, { studentId: "s2", overallPercentage: 60 }];
} } });

let GET: (req: Request) => Promise<Response>;
before(async () => { ({ GET } = await import("../../src/app/api/grade-config/weighted-result/class-averages/route") as any); });
beforeEach(() => { state.user = { userId: "admin-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" }; state.classWheres = []; state.calc = []; });

const call = (query: string) => GET(new Request(`http://qa.test/api/grade-config/weighted-result/class-averages?${query}`));

test("one request returns an average per class in the caller's campus and nothing per student", async () => {
  const res = await call("academicYear=2026&classIds=class-a1,class-a2,class-a3,class-a1");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.data.averages, [
    { classId: "class-a1", avg: 70, gradedCount: 2 },
    { classId: "class-a2", avg: null, gradedCount: 0 },
    { classId: "class-a3", avg: 70, gradedCount: 2 },
  ]);
  assert.equal(JSON.stringify(body).includes("studentId"), false);
  assert.equal(JSON.stringify(body).includes("rollNo"), false);
  assert.deepEqual(state.classWheres, [{ id: { in: ["class-a1", "class-a2", "class-a3"] }, campusId: "campus-a" }]);
  assert.ok(state.calc.every(([, campus, year]) => campus === "campus-a" && year === 2026));
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
});

test("another campus's and another school's classes are left out and never calculated", async () => {
  const body = await (await call("academicYear=2026&classIds=class-a1,class-b1,class-x1")).json();
  assert.deepEqual(body.data.averages.map((a: { classId: string }) => a.classId), ["class-a1"]);
  assert.deepEqual(state.calc.map(([id]) => id), ["class-a1"]);
  state.user = { userId: "admin-b", role: "CAMPUS_ADMIN", schoolId: "school-b", campusId: "campus-x" };
  const other = await (await call("academicYear=2026&classIds=class-a1,class-x1")).json();
  assert.deepEqual(other.data.averages.map((a: { classId: string }) => a.classId), ["class-x1"]);
});

test("a denied role gets 403, no campus gets 400, and no class ids is a validation error", async () => {
  state.user = { userId: "parent-a", role: "PARENT", schoolId: "school-a", campusId: "campus-a" };
  assert.equal((await call("classIds=class-a1")).status, 403);
  state.user = { userId: "owner", role: "ADMIN", schoolId: "school-a", campusId: null };
  assert.equal((await call("classIds=class-a1")).status, 400);
  state.user = { userId: "admin-a", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
  assert.equal((await call("academicYear=2026")).status, 400);
  assert.equal((await call(`classIds=${Array.from({ length: 201 }, (_, i) => `c${i}`).join(",")}`)).status, 400);
  assert.equal(state.calc.length, 0);
});

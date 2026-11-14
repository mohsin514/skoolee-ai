import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1966: GET /api/classes keeps its every-year default; scope=current, academicYear and view=picker
// are opt-in and never widen the school, campus or teacher scope.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string };
let actor: User;
type Row = { id: string; schoolId: string; campusId: string; academicYear: number; status: string; archivedAt: null; classTeacherId: string | null; subjectTeachers: string[] };
const rows: Row[] = [
  { id: "a1-2025", schoolId: "school-a", campusId: "campus-a1", academicYear: 2025, status: "COMPLETED", archivedAt: null, classTeacherId: "t1", subjectTeachers: [] },
  { id: "a1-2026", schoolId: "school-a", campusId: "campus-a1", academicYear: 2026, status: "ACTIVE", archivedAt: null, classTeacherId: null, subjectTeachers: ["t1"] },
  { id: "a1-2027", schoolId: "school-a", campusId: "campus-a1", academicYear: 2027, status: "ACTIVE", archivedAt: null, classTeacherId: null, subjectTeachers: [] },
  { id: "a2-2026", schoolId: "school-a", campusId: "campus-a2", academicYear: 2026, status: "ACTIVE", archivedAt: null, classTeacherId: null, subjectTeachers: [] },
  { id: "b1-2026", schoolId: "school-b", campusId: "campus-b1", academicYear: 2026, status: "ACTIVE", archivedAt: null, classTeacherId: null, subjectTeachers: [] },
];
let calls: Array<{ where: any; select?: any; include?: any }> = [];

const matches = (row: Row, where: any): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
  if (key === "OR") return value.some((part: any) => matches(row, part));
  if (key === "subjects") return row.subjectTeachers.includes(value.some.teacherId);
  return (row as any)[key] === value;
});

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => actor,
    assertStaffRole: (user: User) => { if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Forbidden", 403); },
    resolveCampusId: async (user: User) => user.campusId,
    scopedCampusWhere: (user: User, campusId: string) => ({ schoolId: user.schoolId, campusId }),
    canLeadAcademics: () => false,
    canManageCampusOps: () => false,
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: { prisma: { class: { findMany: async (args: { where: any; select?: any; include?: any }) => { calls.push(args); return rows.filter(row => matches(row, args.where)).map(({ id }) => ({ id })); } } } },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => {} } });
mock.module(src("lib/api/teacher-assignments.ts"), { namedExports: { authorizeAssignment: async () => {}, updateClassWithTeacherAssignment: async () => ({}) } });
mock.module(src("lib/academic/structure.ts"), { namedExports: { effectiveDate: () => new Date(), findDuplicateClass: async () => null, isIdentityConflict: () => false, recordTeachingAssignment: async () => {} } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async () => ({}) } });
mock.module(src("lib/timetable/locking.ts"), { namedExports: { lockTimetableCampus: async () => {} } });

const list = async (query = "") => {
  const { GET } = await import("../../src/app/api/classes/route");
  return GET(new Request(`http://local/api/classes${query}`) as never);
};
const ids = async (res: Response) => ((await res.json()).data as { id: string }[]).map(r => r.id).sort();

beforeEach(() => {
  calls = [];
  actor = { userId: "p1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1" };
});

test("the default still lists every year with the full include", async () => {
  assert.deepEqual(await ids(await list()), ["a1-2025", "a1-2026", "a1-2027"]);
  assert.ok(calls[0].include?.subjects && !calls[0].select);
});

test("scope=current drops closed-year classes but keeps next-year planning classes", async () => {
  assert.deepEqual(await ids(await list("?scope=current")), ["a1-2026", "a1-2027"]);
});

test("academicYear serves one year and rejects a non-integer year", async () => {
  assert.deepEqual(await ids(await list("?academicYear=2025")), ["a1-2025"]);
  assert.equal((await list("?academicYear=20x5")).status, 400);
  assert.equal(calls.length, 1);
});

test("view=picker selects slim fields with no teacher profiles or counts", async () => {
  assert.deepEqual(await ids(await list("?view=picker&scope=current")), ["a1-2026", "a1-2027"]);
  const { select } = calls[0];
  assert.equal(calls[0].include, undefined);
  assert.equal(select.classTeacher, undefined);
  assert.equal(select._count, undefined);
  assert.deepEqual(select.subjects.select, { id: true, name: true, teacherId: true });
});

test("another campus or school never sees campus-a1 classes, with or without the options", async () => {
  for (const query of ["", "?scope=current", "?view=picker&scope=current"]) {
    actor = { ...actor, schoolId: "school-a", campusId: "campus-a2" };
    assert.deepEqual(await ids(await list(query)), ["a2-2026"]);
    actor = { ...actor, schoolId: "school-b", campusId: "campus-b1" };
    assert.deepEqual(await ids(await list(query)), ["b1-2026"]);
  }
});

test("a teacher sees only assigned classes in every mode", async () => {
  actor = { ...actor, role: "TEACHER", userId: "t1" };
  assert.deepEqual(await ids(await list()), ["a1-2025", "a1-2026"]);
  assert.deepEqual(await ids(await list("?scope=current")), ["a1-2026"]);
  assert.deepEqual(await ids(await list("?view=picker&scope=current")), ["a1-2026"]);
});

for (const role of ["PARENT", "STUDENT"]) {
  test(`a ${role.toLowerCase()} is denied before any class is read`, async () => {
    actor = { ...actor, role };
    for (const query of ["", "?view=picker&scope=current"]) assert.equal((await list(query)).status, 403);
    assert.equal(calls.length, 0);
  });
}

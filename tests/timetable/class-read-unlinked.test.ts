import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1936: GET /api/timetable/class for a learner with no linked student record (or no class) is an empty
// timetable (200, data null, linked flag), not a 400 the page shows as a form-validation error. Staff without
// ?classId= still get 400, and a family's class is still checked against the caller's school and campus.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string };
let actor: User;
const students = [
  { userId: "s-class", schoolId: "school-a", campusId: "campus-a1", classId: "class-a1" },
  { userId: "s-noclass", schoolId: "school-a", campusId: "campus-a1", classId: null },
];
const classes = [{ id: "class-a1", schoolId: "school-a", campusId: "campus-a1" }];
let classReads: Array<Record<string, unknown>> = [];

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    assertSharedModuleRead: async () => {},
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/auth/policy.ts"), {
  namedExports: {
    studentScope: (user: User) => ({ userId: user.userId, schoolId: user.schoolId, campusId: user.campusId }),
    campusScope: (user: User) => ({ schoolId: user.schoolId, campusId: user.campusId }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      student: {
        findFirst: async ({ where }: { where: { userId: string; schoolId: string; campusId: string } }) =>
          students.find(s => s.userId === where.userId && s.schoolId === where.schoolId && s.campusId === where.campusId) ?? null,
      },
      class: {
        findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => {
          classReads.push(where);
          return classes.find(c => c.id === where.id && c.schoolId === where.schoolId && c.campusId === where.campusId) ?? null;
        },
      },
    },
  },
});
mock.module(src("lib/timetable/versions.ts"), { namedExports: { publishedClassTimetable: async () => ({ version: null, upcoming: null }) } });

const get = async (query = "") => {
  const { GET } = await import("../../src/app/api/timetable/class/route");
  const url = new URL(`http://local/api/timetable/class${query}`);
  return GET(Object.assign(new Request(url), { nextUrl: url }) as never);
};

beforeEach(() => {
  classReads = [];
  actor = { userId: "s-unlinked", role: "STUDENT", schoolId: "school-a", campusId: "campus-a1" };
});

test("an unlinked learner gets an empty timetable marked not linked, not a 400", async () => {
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: null, upcoming: null, linked: false });
  assert.equal(classReads.length, 0);
});

test("a linked learner without a class gets an empty timetable marked linked", async () => {
  actor = { ...actor, userId: "s-noclass" };
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: null, upcoming: null, linked: true });
});

test("a learner's own record in another school does not count as linked", async () => {
  actor = { ...actor, userId: "s-class", schoolId: "school-b", campusId: "campus-b1" };
  assert.equal((await (await get("?classId=class-a1")).json()).linked, false);
  assert.equal(classReads.length, 0, "the explicit classId from a family is ignored");
});

test("a linked learner's class is still checked against school and campus", async () => {
  actor = { ...actor, userId: "s-class" };
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(classReads, [{ id: "class-a1", schoolId: "school-a", campusId: "campus-a1" }]);
});

test("staff without a classId still get 400", async () => {
  actor = { userId: "t1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" };
  assert.equal((await get()).status, 400);
});

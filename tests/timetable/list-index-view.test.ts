import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1966: GET /api/timetable?view=index lists every year without slots and ?academicYear= loads one
// year's slots. Both keep the campus, draft and family rules of the default list.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string; fullName: string };
let actor: User;
const rows = [
  { id: "a1-2025-pub", campusId: "campus-a1", academicYear: 2025, status: "PUBLISHED" },
  { id: "a1-2026-draft", campusId: "campus-a1", academicYear: 2026, status: "DRAFT" },
  { id: "a1-2026-pub", campusId: "campus-a1", academicYear: 2026, status: "PUBLISHED" },
  { id: "a2-2026-pub", campusId: "campus-a2", academicYear: 2026, status: "PUBLISHED" },
  { id: "b1-2026-pub", campusId: "campus-b1", academicYear: 2026, status: "PUBLISHED" },
];
let calls: Array<{ where: any; select?: any; include?: any }> = [];
const managers = new Set(["PRINCIPAL", "SCHOOL_ADMIN"]);

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    isFamilyRole: (user: User) => user.role === "STUDENT" || user.role === "PARENT",
    assertSharedModuleRead: async (user: User) => { if (user.role === "RECEPTIONIST") throw new ApiError("Insufficient permissions: timetable.view", 403); },
    resolveCampusId: async (user: User) => user.campusId,
    canManageOperations: (user: User) => managers.has(user.role),
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      timetable: {
        findMany: async (args: { where: any; select?: any; include?: any }) => {
          calls.push(args);
          return rows.filter(r => Object.entries(args.where).every(([key, value]) => (r as any)[key] === value)).map(({ id }) => ({ id }));
        },
      },
    },
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => {} } });
mock.module(src("lib/timetable/manual.ts"), { namedExports: { createManualTimetable: async () => ({}), resolveTimetableCreateCampus: async () => "" } });

const list = async (query: string) => {
  const { GET } = await import("../../src/app/api/timetable/route");
  const url = new URL(`http://local/api/timetable${query}`);
  return GET(Object.assign(new Request(url), { nextUrl: url }) as never);
};
const ids = async (res: Response) => ((await res.json()).data as { id: string }[]).map(r => r.id).sort();

beforeEach(() => {
  calls = [];
  actor = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Principal" };
});

test("the index lists every year of the campus without slots", async () => {
  assert.deepEqual(await ids(await list("?view=index")), ["a1-2025-pub", "a1-2026-draft", "a1-2026-pub"]);
  assert.equal(calls[0].include, undefined);
  assert.equal(calls[0].select.slots, undefined);
  assert.deepEqual(Object.keys(calls[0].select).sort(), ["academicYear", "class", "classId", "createdAt", "draftRevision", "id", "publishedAt", "status", "term"]);
});

test("academicYear loads that year's slots only", async () => {
  assert.deepEqual(await ids(await list("?academicYear=2026")), ["a1-2026-draft", "a1-2026-pub"]);
  assert.ok(calls[0].include.slots);
});

test("a non-integer academicYear is rejected before any read", async () => {
  for (const year of ["20x6", "2026.5", "NaN"]) assert.equal((await list(`?academicYear=${year}`)).status, 400);
  assert.equal(calls.length, 0);
});

test("a teacher's index and year list hold published timetables only", async () => {
  actor = { ...actor, role: "TEACHER" };
  assert.deepEqual(await ids(await list("?view=index")), ["a1-2025-pub", "a1-2026-pub"]);
  assert.deepEqual(await ids(await list("?academicYear=2026")), ["a1-2026-pub"]);
});

test("another campus or school never sees campus-a1 rows in either mode", async () => {
  for (const query of ["?view=index", "?academicYear=2026"]) {
    actor = { ...actor, campusId: "campus-a2" };
    assert.deepEqual(await ids(await list(query)), ["a2-2026-pub"]);
    actor = { ...actor, schoolId: "school-b", campusId: "campus-b1" };
    assert.deepEqual(await ids(await list(query)), ["b1-2026-pub"]);
  }
});

for (const role of ["PARENT", "STUDENT", "RECEPTIONIST"]) {
  test(`a ${role.toLowerCase()} is denied both modes before any read`, async () => {
    actor = { ...actor, role };
    for (const query of ["?view=index", "?academicYear=2026"]) assert.equal((await list(query)).status, 403);
    assert.equal(calls.length, 0);
  });
}

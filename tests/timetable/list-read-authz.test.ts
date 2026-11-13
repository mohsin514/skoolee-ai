import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-444 (PM-13.19): GET /api/timetable must never hand drafts to families or non-managing staff,
// and must stay inside the caller's school and campus.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string; fullName: string };
let actor: User;
const rows = [
  { id: "tt-a-draft", campusId: "campus-a1", status: "DRAFT" },
  { id: "tt-a-pub", campusId: "campus-a1", status: "PUBLISHED" },
  { id: "tt-a2-pub", campusId: "campus-a2", status: "PUBLISHED" },
  { id: "tt-b-pub", campusId: "campus-b1", status: "PUBLISHED" },
];
let dbReads = 0;
const managers = new Set(["PRINCIPAL", "SCHOOL_ADMIN"]);

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    isFamilyRole: (user: User) => user.role === "STUDENT" || user.role === "PARENT",
    assertSharedModuleRead: async (user: User) => {
      if (user.role === "RECEPTIONIST") throw new ApiError("Insufficient permissions: timetable.view", 403);
    },
    resolveCampusId: async (user: User) => user.campusId,
    canManageOperations: (user: User) => managers.has(user.role),
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      timetable: {
        findMany: async ({ where }: { where: { campusId: string; status?: string } }) => {
          dbReads++;
          return rows.filter(r => r.campusId === where.campusId && (!where.status || r.status === where.status));
        },
      },
    },
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => {} } });
mock.module(src("lib/timetable/manual.ts"), { namedExports: { createManualTimetable: async () => ({}), resolveTimetableCreateCampus: async () => "" } });

const list = async () => {
  const { GET } = await import("../../src/app/api/timetable/route");
  const url = new URL("http://local/api/timetable");
  return GET(Object.assign(new Request(url), { nextUrl: url }) as never);
};
const ids = async (res: Response) => ((await res.json()).data as { id: string }[]).map(r => r.id).sort();

beforeEach(() => {
  dbReads = 0;
  actor = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Principal" };
});

test("the principal lists drafts and published timetables on their own campus only", async () => {
  assert.deepEqual(await ids(await list()), ["tt-a-draft", "tt-a-pub"]);
});

test("a teacher lists only published timetables", async () => {
  actor = { ...actor, role: "TEACHER" };
  assert.deepEqual(await ids(await list()), ["tt-a-pub"]);
});

test("a principal on another campus or school never sees campus-a1 rows", async () => {
  actor = { ...actor, campusId: "campus-a2" };
  assert.deepEqual(await ids(await list()), ["tt-a2-pub"]);
  actor = { ...actor, schoolId: "school-b", campusId: "campus-b1" };
  assert.deepEqual(await ids(await list()), ["tt-b-pub"]);
});

for (const role of ["PARENT", "STUDENT"]) {
  test(`a ${role.toLowerCase()} is denied the list before any record is read`, async () => {
    actor = { ...actor, role };
    assert.equal((await list()).status, 403);
    assert.equal(dbReads, 0);
  });
}

test("a staff role without timetable view gets 403", async () => {
  actor = { ...actor, role: "RECEPTIONIST" };
  assert.equal((await list()).status, 403);
  assert.equal(dbReads, 0);
});

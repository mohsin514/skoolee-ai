import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-438 (PM-13.13): GET /api/timetable/[id] returns the working draft. Only academic managers may read it.
// Teachers, other staff and families get the same 404 as an unknown id, and no record is read for them.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string; fullName: string };
let actor: User;
const managerRoles = ["CAMPUS_ADMIN", "PRINCIPAL", "ADMIN", "SUPER_ADMIN"];
const rows = [
  { id: "tt-a1", schoolId: "school-a", campusId: "campus-a1", status: "PUBLISHED", draftRevision: 3, class: { id: "c1", name: "Grade 7 A", section: "A" }, slots: [{ id: "s1" }] },
  { id: "tt-a2", schoolId: "school-a", campusId: "campus-a2", status: "DRAFT", draftRevision: 1, class: { id: "c3", name: "Grade 8 A", section: "A" }, slots: [] },
  { id: "tt-b1", schoolId: "school-b", campusId: "campus-b1", status: "DRAFT", draftRevision: 1, class: { id: "c2", name: "Grade 7 B", section: "B" }, slots: [] },
];
let dbReads = 0;

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    canManageOperations: (user: User) => managerRoles.includes(user.role),
    canLeadAcademics: async () => false,
    canManageAcademics: (user: User) => managerRoles.includes(user.role),
    isFamilyRole: (user: User) => user.role === "STUDENT" || user.role === "PARENT",
    assertSharedModuleRead: async () => {},
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      timetable: {
        findFirst: async ({ where }: { where: { id: string; campusId?: string } }) => {
          dbReads++;
          return rows.find(r => r.id === where.id && (!where.campusId || r.campusId === where.campusId)) ?? null;
        },
      },
    },
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => {} } });
mock.module(src("lib/timetable/notify.ts"), { namedExports: { notifyTimetableVersion: async () => ({ sent: false }) } });
mock.module(src("lib/timetable/manual.ts"), {
  namedExports: {
    resolveTimetableCampus: async (user: User, id: string) => {
      const row = rows.find(r => r.id === id && r.schoolId === user.schoolId && (user.role === "SUPER_ADMIN" || r.campusId === user.campusId));
      if (!row) throw new ApiError("Timetable not found", 404);
      return row.campusId;
    },
    previewTimetablePublish: async () => ({}), saveManualTimetable: async () => ({}), changeManualTimetableStatus: async () => ({}),
    deleteManualTimetable: async () => ({}), publishTimetableVersion: async () => ({}),
    TimetableValidationError: class extends Error {},
  },
});

const get = async (id: string) => {
  const { GET } = await import("../../src/app/api/timetable/[id]/route");
  const url = new URL(`http://local/api/timetable/${id}`);
  return GET(Object.assign(new Request(url), { nextUrl: url }) as never, { params: Promise.resolve({ id }) });
};

beforeEach(() => {
  dbReads = 0;
  actor = { userId: "u1", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Campus Admin" };
});

test("the campus admin reads the draft of their own campus", async () => {
  const res = await get("tt-a1");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.draftRevision, 3);
});

test("a teacher on the same campus is denied the draft before any record is read", async () => {
  actor = { ...actor, userId: "t1", role: "TEACHER", fullName: "QA Teacher" };
  const res = await get("tt-a1");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.data, undefined);
  assert.equal(body.slots, undefined);
  assert.equal(dbReads, 0);
});

test("a teacher gets the same 404 for a real draft id and for an unknown id", async () => {
  actor = { ...actor, role: "TEACHER" };
  const real = await get("tt-a1");
  const unknown = await get("tt-missing");
  assert.equal(real.status, 404);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await real.json(), await unknown.json());
});

test("a campus admin of another campus in the same school gets 404", async () => {
  actor = { ...actor, campusId: "campus-a2" };
  const res = await get("tt-a1");
  assert.equal(res.status, 404);
});

test("a campus admin of another school gets 404 and the record is not returned", async () => {
  actor = { ...actor, schoolId: "school-b", campusId: "campus-b1" };
  const res = await get("tt-a1");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).data, undefined);
});

test("a guardian is denied even for a draft in their own school", async () => {
  actor = { ...actor, userId: "g1", role: "PARENT", fullName: "QA Guardian" };
  const res = await get("tt-a2");
  assert.equal(res.status, 404);
  assert.equal(dbReads, 0);
});

test("a teacher cannot load the publication preview of a draft either", async () => {
  actor = { ...actor, role: "TEACHER" };
  const { GET } = await import("../../src/app/api/timetable/[id]/route");
  const url = new URL("http://local/api/timetable/tt-a2?publication=1");
  const res = await GET(Object.assign(new Request(url), { nextUrl: url }) as never, { params: Promise.resolve({ id: "tt-a2" }) });
  assert.equal(res.status, 404);
});

import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-430 (PM-13.05): GET /api/timetable/[id] must deny families and roles without timetable view,
// and must never resolve a record outside the caller's school and campus.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string; fullName: string };
let actor: User;
const rows = [
  { id: "tt-a1", schoolId: "school-a", campusId: "campus-a1", status: "DRAFT", class: { id: "c1", name: "Grade 7 A", section: "A" }, slots: [] },
  { id: "tt-b1", schoolId: "school-b", campusId: "campus-b1", status: "PUBLISHED", class: { id: "c2", name: "Grade 7 B", section: "B" }, slots: [] },
];
let dbReads = 0;

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    isFamilyRole: (user: User) => user.role === "STUDENT" || user.role === "PARENT",
    assertSharedModuleRead: async (user: User) => {
      if (user.role === "STUDENT" || user.role === "PARENT") return;
      if (user.role === "RECEPTIONIST") throw new ApiError("Insufficient permissions: timetable.view", 403);
    },
    canManageOperations: () => false,
    canLeadAcademics: async () => false,
    canManageAcademics: (user: User) => ["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(user.role),
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
      const row = rows.find(r => r.id === id && r.schoolId === user.schoolId && r.campusId === user.campusId);
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
  actor = { userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Principal" };
});

test("the principal reads a timetable in their own school and campus", async () => {
  const res = await get("tt-a1");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.id, "tt-a1");
});

test("a principal of another school gets 404 and the record is not returned", async () => {
  actor = { ...actor, schoolId: "school-b", campusId: "campus-b1" };
  const res = await get("tt-a1");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).data, undefined);
});

test("a guardian is denied even for a draft in their own school, before any record is read", async () => {
  actor = { userId: "g1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Guardian" };
  const res = await get("tt-a1");
  assert.equal(res.status, 404);
  assert.equal(dbReads, 0);
});

test("a student is denied the timetable by id", async () => {
  actor = { userId: "s1", role: "STUDENT", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Student" };
  assert.equal((await get("tt-a1")).status, 404);
  assert.equal(dbReads, 0);
});

test("a staff role without timetable view gets 403 and no record is read", async () => {
  actor = { userId: "r1", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Reception" };
  const res = await get("tt-a1");
  assert.equal(res.status, 403);
  assert.equal(dbReads, 0);
});

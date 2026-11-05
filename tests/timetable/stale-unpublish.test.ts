import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1742: an unpublish carries the revision/publication the tab saw; a stale one is a 409 that changes nothing.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const schools = { "school-a": { campusId: "campus-a" }, "school-b": { campusId: "campus-b" } } as const;
let actor: { userId: string; role: string; schoolId: keyof typeof schools; fullName: string };
let leads = true;
// One board per school; the guard runs against the caller's own school's board only.
const boards: Record<string, { status: string; draftRevision: number; publishedAt: Date | null }> = {};
const calls: { schoolId: string; campusId: string }[] = [];

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    canManageOperations: () => true,
    canLeadAcademics: async () => leads,
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: () => {} } });
mock.module(src("lib/timetable/notify.ts"), { namedExports: { notifyTimetableVersion: async () => ({ sent: false }) } });

// Mirror of the real guard so the route is exercised end to end against per-school boards.
const guard = (board: typeof boards[string], expected: { draftRevision?: unknown; publishedAt?: unknown }) => {
  const seen = typeof expected.publishedAt === "string" && expected.publishedAt ? new Date(expected.publishedAt).getTime() : null;
  if (typeof expected.draftRevision !== "number" || expected.draftRevision !== board.draftRevision || board.status !== "PUBLISHED" || (seen !== null && seen !== board.publishedAt?.getTime()))
    throw new ApiError("This timetable changed in another session. Refresh and review the current timetable before unpublishing.", 409);
};
mock.module(src("lib/timetable/manual.ts"), {
  namedExports: {
    resolveTimetableCampus: async (user: typeof actor) => schools[user.schoolId].campusId,
    changeManualTimetableStatus: async (user: typeof actor, campusId: string, _id: string, _action: string, expected: { draftRevision?: unknown; publishedAt?: unknown }) => {
      calls.push({ schoolId: user.schoolId, campusId });
      const board = boards[user.schoolId];
      guard(board, expected);
      board.status = "DRAFT"; board.publishedAt = null;
      return { changed: true, data: { class: { id: "c", name: "QA-01 Grade 5" } } };
    },
    publishTimetableVersion: async () => ({}), saveManualTimetable: async () => ({}), deleteManualTimetable: async () => ({}), previewTimetablePublish: async () => ({}),
    TimetableValidationError: class extends Error {},
  },
});

const put = async (body: unknown) => {
  const { PUT } = await import("../../src/app/api/timetable/[id]/route");
  return PUT(new Request("http://local/api/timetable/t1", { method: "PUT", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "t1" }) });
};
const first = new Date("2026-11-01T08:00:00.000Z");
const republished = new Date("2026-11-05T09:00:00.000Z");

beforeEach(() => {
  actor = { userId: "qa-principal-a", role: "PRINCIPAL", schoolId: "school-a", fullName: "QA-01 Principal" };
  leads = true; calls.length = 0;
  boards["school-a"] = { status: "PUBLISHED", draftRevision: 4, publishedAt: first };
  boards["school-b"] = { status: "PUBLISHED", draftRevision: 4, publishedAt: first };
});

test("a fresh unpublish succeeds", async () => {
  const res = await put({ action: "unpublish", draftRevision: 4, publishedAt: first.toISOString() });
  assert.equal(res.status, 200);
  assert.equal(boards["school-a"].status, "DRAFT");
});

test("an unpublish from a tab that saw the old version gets 409 after a republish and the schedule stays published", async () => {
  Object.assign(boards["school-a"], { draftRevision: 5, publishedAt: republished }); // session B edited and republished
  const res = await put({ action: "unpublish", draftRevision: 4, publishedAt: first.toISOString() });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /changed in another session/);
  assert.deepEqual(boards["school-a"], { status: "PUBLISHED", draftRevision: 5, publishedAt: republished });
});

test("a same-revision republish is still caught by publishedAt; a missing revision is refused", async () => {
  boards["school-a"].publishedAt = republished;
  assert.equal((await put({ action: "unpublish", draftRevision: 4, publishedAt: first.toISOString() })).status, 409);
  assert.equal((await put({ action: "unpublish" })).status, 409);
  assert.equal(boards["school-a"].status, "PUBLISHED");
});

test("two schools stay isolated", async () => {
  actor = { ...actor, userId: "qa-principal-b", schoolId: "school-b" };
  const res = await put({ action: "unpublish", draftRevision: 4, publishedAt: first.toISOString() });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [{ schoolId: "school-b", campusId: "campus-b" }]);
  assert.equal(boards["school-b"].status, "DRAFT");
  assert.equal(boards["school-a"].status, "PUBLISHED");
});

test("a role that cannot lead academics gets 403 and nothing changes", async () => {
  leads = false;
  const res = await put({ action: "unpublish", draftRevision: 4, publishedAt: first.toISOString() });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
  assert.equal(boards["school-a"].status, "PUBLISHED");
});

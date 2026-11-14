import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1936: GET /api/student/exam-timeline for a learner with no linked student record is an empty, not-linked
// answer (200, timeline null, linked false), not a 403 the "My next paper" panel shows as an access denial.
// Other roles are still refused, and the record lookup stays pinned to the caller's school.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type User = { userId: string; role: string; schoolId: string; campusId: string };
let actor: User;
const students = [{ id: "stu-1", studentUserId: "s-linked", schoolId: "school-a", campusId: "campus-a1", classId: "class-a1" }];
let studentReads: Array<Record<string, unknown>> = [];

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => actor,
    ApiError,
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      student: {
        findFirst: async ({ where }: { where: { schoolId: string; studentUserId: string } }) => {
          studentReads.push(where);
          return students.find(s => s.studentUserId === where.studentUserId && s.schoolId === where.schoolId) ?? null;
        },
      },
      examSeat: { findMany: async () => [] },
      schoolAiExamAssignment: { findMany: async () => [] },
      schoolAiExamAttempt: { findMany: async () => [] },
      subject: { findMany: async () => [] },
    },
  },
});
mock.module(src("lib/datetime.ts"), { namedExports: { getSchoolTimeZone: async () => "Asia/Karachi" } });
mock.module(src("lib/academic/datesheet-publication.ts"), { namedExports: { publishedPapersForClasses: async () => [] } });
mock.module(src("lib/school-ai/exam.ts"), { namedExports: { DELIVERED_EXAM_MODES: ["ONLINE"] } });
mock.module(src("lib/school-ai/exam-timeline.ts"), { namedExports: { buildExamTimeline: ({ timeZone }: { timeZone: string }) => ({ now: new Date(0).toISOString(), timeZone, next: null, upcoming: [], past: [] }) } });

const get = async () => {
  const { GET } = await import("../../src/app/api/student/exam-timeline/route");
  return GET();
};

beforeEach(() => {
  studentReads = [];
  actor = { userId: "s-unlinked", role: "STUDENT", schoolId: "school-a", campusId: "campus-a1" };
});

test("an unlinked learner gets an empty timeline marked not linked, not a 403", async () => {
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { timeline: null, linked: false });
  assert.equal(studentReads[0]?.schoolId, "school-a");
});

test("a linked learner still gets their timeline", async () => {
  actor = { ...actor, userId: "s-linked" };
  const res = await get();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.linked, undefined);
  assert.equal(body.timeline.timeZone, "Asia/Karachi");
});

test("a learner's record in another school does not count as linked", async () => {
  actor = { ...actor, userId: "s-linked", schoolId: "school-b", campusId: "campus-b1" };
  assert.deepEqual(await (await get()).json(), { timeline: null, linked: false });
  assert.equal(studentReads[0]?.schoolId, "school-b");
});

test("other roles are still refused", async () => {
  actor = { userId: "p1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" };
  assert.equal((await get()).status, 403);
  assert.equal(studentReads.length, 0);
});

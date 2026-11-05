import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1715: a family's released online results page past the newest 30 with a cursor; every page keeps
// school, campus, class and child scope, and the route denies families without learning-record access.
type Sitting = { id: string; schoolId: string; campusId: string; classId: string; studentIds: string[]; title: string; resultsReleasedAt: Date };
const sittings: Sitting[] = [];
const add = (school: string, campus: string, cls: string, student: string, n: number, year = 2025) => {
  for (let i = 0; i < n; i++) sittings.push({ id: `${student}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, classId: cls, studentIds: [student], title: `Quiz ${i}`, resultsReleasedAt: new Date(Date.UTC(year + Math.floor(i / 20), 0, 1 + (i % 20))) });
};
add("school-a", "campus-a1", "class-a1", "s-a", 33); // 33 releases over two academic years
add("school-a", "campus-a2", "class-a2", "s-a2", 2); // same school, other campus, other child
add("school-b", "campus-b1", "class-b1", "s-b", 4); // other school
const students = new Map([["s-a", ["school-a", "campus-a1", "class-a1"]], ["s-a2", ["school-a", "campus-a2", "class-a2"]], ["s-b", ["school-b", "campus-b1", "class-b1"]]]);

type Find = { where: { schoolId: string; campusId: string; classId: string; studentIds: { array_contains: string[] } }; take: number; skip?: number; cursor?: { id: string } };
const prisma = {
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { const s = students.get(where.id); return s && s[0] === where.schoolId ? { id: where.id, campusId: s[1], classId: s[2] } : null; } },
  schoolAiExamAssignment: {
    findMany: async ({ where, take, skip = 0, cursor }: Find) => {
      const scoped = sittings.filter(r => r.schoolId === where.schoolId && r.campusId === where.campusId && r.classId === where.classId && where.studentIds.array_contains.every(id => r.studentIds.includes(id)))
        .sort((a, b) => b.resultsReleasedAt.getTime() - a.resultsReleasedAt.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? scoped.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return scoped.slice(start + skip, start + skip + take).map(r => ({ id: r.id, title: r.title, resultsReleasedAt: r.resultsReleasedAt, paperSnapshot: { curriculumId: "c", curriculumVersion: 1 } }));
    },
  },
  schoolAiExamAttempt: { findMany: async ({ where }: { where: { assignmentId: { in: string[] } } }) => where.assignmentId.in.map(id => ({ assignmentId: id, review: { marks: [{ marks: 4 }], note: `Note ${id}` }, responses: [], reviewVersion: 1 })) },
  schoolAiRevision: { findFirst: async () => null },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/datetime", { namedExports: { getSchoolTimeZone: async () => "UTC" } });
mock.module("@/lib/academic/datesheet-publication", { namedExports: { publishedPapersForClasses: async () => [] } });
mock.module("../../src/lib/school-ai/exam-timeline.ts", { namedExports: { buildExamTimeline: () => [] } });
mock.module("../../src/lib/school-ai/exam.ts", { namedExports: { DELIVERED_EXAM_MODES: ["ONLINE"], examReviewSchema: { parse: (v: unknown) => v }, responsesSchema: { parse: (v: unknown) => v } } });
mock.module("../../src/lib/school-ai/assessment.ts", { namedExports: { paperDataSchema: { safeParse: (v: unknown) => ({ success: true, data: { ...(v as object), blueprint: { totalMarks: 10 } } }) }, curriculumDataSchema: { safeParse: () => ({ success: false }) } } });
mock.module("../../src/lib/school-ai/recovery.ts", { namedExports: { deriveFeedback: () => [] } });

class AccessDenied extends Error {}
let scope = { studentId: "s-a", schoolId: "school-a", permissions: { learningRecords: true } };
mock.module("@/lib/auth/policy", { namedExports: { AccessDenied } });
mock.module("@/lib/parent/resolve-child", { namedExports: { withParentScope: async (_req: unknown, fn: (s: typeof scope) => Promise<Response>) => fn(scope) } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, errorResponse: (e: unknown) => Response.json({ success: false }, { status: e instanceof AccessDenied ? 403 : 500 }) } });

test("the first page holds the newest 30 and the cursor reaches every older release across years", async () => {
  const { familyExamResults } = await import("../../src/lib/school-ai/exam-timeline-service");
  const first = await familyExamResults("school-a", "s-a");
  assert.equal(first.results.length, 30);
  assert.equal(first.results[0].id, "s-a-32");
  assert.ok(first.nextCursor);
  const older = await familyExamResults("school-a", "s-a", first.nextCursor);
  assert.deepEqual(older.results.map(r => r.id), ["s-a-02", "s-a-01", "s-a-00"]);
  assert.equal(older.nextCursor, null);
  assert.equal(older.results[2].note, "Note s-a-00");
  assert.equal(new Set([...first.results, ...older.results].map(r => r.id)).size, 33);
});

test("pages never cross school, campus or child", async () => {
  const { familyExamResults } = await import("../../src/lib/school-ai/exam-timeline-service");
  assert.deepEqual((await familyExamResults("school-a", "s-a2")).results.map(r => r.id), ["s-a2-01", "s-a2-00"]);
  assert.deepEqual((await familyExamResults("school-b", "s-a")).results, []);
  const first = await familyExamResults("school-a", "s-a");
  // Another child's cursor never leaks the first child's rows.
  assert.deepEqual((await familyExamResults("school-a", "s-a2", first.nextCursor)).results, []);
});

test("the route passes the cursor, returns nextCursor and denies families without learning-record access", async () => {
  const { GET } = await import("../../src/app/api/parent/exam-results/route");
  const req = (q: string) => ({ nextUrl: new URL(`http://x/api/parent/exam-results${q}`) }) as never;
  const first = await (await GET(req(""))).json();
  assert.equal(first.data.length, 30);
  const older = await (await GET(req(`?cursor=${first.nextCursor}`))).json();
  assert.equal(older.data.length, 3);
  assert.equal(older.nextCursor, null);
  scope = { ...scope, permissions: { learningRecords: false } };
  assert.equal((await GET(req(""))).status, 403);
});

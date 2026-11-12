import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1842: drafting AI remarks for a class used to make one AI call per pupil, one after another, in a single
// request that read every student column. A batch request now drafts one chunk (20 pupils, 4 at a time), reads only
// id and name, checks credits per chunk and answers with nextCursor until the class is done.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, any>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };

const PUPILS = Array.from({ length: 45 }, (_, i) => ({ id: `st-${String(i).padStart(2, "0")}`, fullName: `Pupil ${i}`, rollNo: i, cnic: "synthetic-private" }));
const exams: Row[] = [
  { id: "exam-a", campusId: "campus-a1", schoolId: "school-a", classId: "class-a", isLocked: true, status: "LOCKED", class: { id: "class-a", name: "Grade 6", section: "A" } },
  { id: "exam-b", campusId: "campus-b1", schoolId: "school-b", classId: "class-b", isLocked: true, status: "LOCKED", class: { id: "class-b", name: "Grade 6", section: "B" } },
];
let current: User | null = null;
let remaining = 1000;
let inFlight = 0;
let peak = 0;
let failFor = new Set<string>();
const markQueries: Row[] = [];
const creditChecks: Array<{ schoolId: string; credits: number }> = [];
const saved: string[] = [];

const prisma = {
  exam: { findFirst: async ({ where }: { where: Row }) => exams.find((e) => e.id === where.id && e.schoolId === where.campus.schoolId) ?? null },
  subject: { count: async ({ where }: { where: Row }) => (where.teacherId === "u-teacher" && where.classId === "class-a" ? 1 : 0) },
  mark: {
    findMany: async (args: Row) => {
      markQueries.push(args);
      const exam = exams.find((e) => e.id === args.where.examId && e.campusId === args.where.campusId && e.schoolId === args.where.campus.schoolId);
      if (!exam) return [];
      return PUPILS.flatMap((p) => ["English", "Maths"].map((subject) => ({ studentId: p.id, marksObtained: 70, grade: "B", student: { id: p.id, fullName: p.fullName }, subject: { name: subject, totalMarks: 100 } })));
    },
  },
};

class AICreditError extends Error { status = 402; }
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/auth.ts"), { namedExports: { getAuthUser: async () => current } });
mock.module(src("lib/billing/response.ts"), { namedExports: { billingAccessResponse: async () => null, planFeatureResponse: async () => null } });
mock.module(src("lib/academic/report-cards.ts"), { namedExports: { isLockedStatus: (status: string) => status === "LOCKED" } });
mock.module(src("lib/ai/openai.ts"), { namedExports: {
  AICreditError,
  getAIModel: () => "model-fixed",
  ensureAICreditsAvailable: async (schoolId: string, credits = 1) => {
    creditChecks.push({ schoolId, credits });
    if (remaining < credits) throw new AICreditError("AI credit limit reached");
  },
  generateRemark: async ({ studentName }: { studentName: string }) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (failFor.has(studentName)) throw new Error("provider down");
    return { remarkEn: `Well done ${studentName}`, remarkUr: "", promptVersion: "v1", model: "model-fixed", tokensUsed: 10 };
  },
  consumeAICreditAndLog: async (input: Row) => { remaining -= 1; saved.push(input.metadata.studentId); return null; },
} });

const reset = (user: User | null) => { current = user; remaining = 1000; peak = 0; failFor = new Set(); markQueries.length = 0; creditChecks.length = 0; saved.length = 0; };
const post = async (body: Row) => {
  const { POST } = await import("../../src/app/api/ai/generate-remarks/route");
  const req = new Request("http://localhost/api/ai/generate-remarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await POST(req as any);
  return { status: res.status, body: await res.json() };
};
const principalA: User = { userId: "u-head", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a1" };

test("a 45-pupil class is drafted in chunks with nextCursor, bounded concurrency and every pupil once", async () => {
  reset(principalA);
  const pages: Row[] = [];
  let cursor: number | null = 0;
  while (cursor !== null) {
    const r = await post({ batch: true, examId: "exam-a", cursor });
    assert.equal(r.status, 200);
    pages.push(r.body);
    cursor = r.body.nextCursor;
  }
  assert.deepEqual(pages.map((p) => [p.processed, p.succeeded, p.nextCursor]), [[20, 20, 20], [40, 20, 40], [45, 5, null]]);
  assert.ok(pages.every((p) => p.total === 45 && p.failed.length === 0));
  assert.deepEqual([...saved].sort(), PUPILS.map((p) => p.id));
  assert.ok(peak > 1 && peak <= 4, `peak concurrency ${peak}`);
  assert.deepEqual(creditChecks.map((c) => c.credits), [20, 20, 5], "credits are checked per chunk");
  const query = markQueries[0];
  assert.deepEqual(query.select.student, { select: { id: true, fullName: true } }, "only id and name are read per mark");
  assert.equal(query.include, undefined);
  assert.deepEqual(query.orderBy[1], { studentId: "asc" }, "rollNo ties break on studentId so cursor pages stay stable");
  assert.equal(query.where.campus.schoolId, "school-a");
  assert.equal(query.where.campusId, "campus-a1");
});

test("a request without a cursor starts at the first pupil", async () => {
  reset(principalA);
  const r = await post({ batch: true, examId: "exam-a" });
  assert.equal(r.status, 200);
  assert.equal(r.body.nextCursor, 20);
  assert.deepEqual([...saved].sort(), PUPILS.slice(0, 20).map((p) => p.id));
});

test("one failed pupil does not discard the chunk; credits running out stops only the next chunk", async () => {
  reset(principalA);
  failFor = new Set(["Pupil 3"]);
  const first = await post({ batch: true, examId: "exam-a", cursor: 0 });
  assert.equal(first.body.succeeded, 19);
  assert.deepEqual(first.body.failed.map((f: Row) => f.studentId), ["st-03"]);
  remaining = 5;
  const second = await post({ batch: true, examId: "exam-a", cursor: first.body.nextCursor });
  assert.equal(second.status, 402);
  assert.equal(saved.length, 19, "drafts saved by the first chunk are kept");
});

test("two schools and a denied role: another school, another campus and an unassigned teacher draft nothing", async () => {
  reset({ userId: "u-b", role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b1" });
  assert.equal((await post({ batch: true, examId: "exam-a" })).status, 404);
  reset({ userId: "u-a2", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a2" });
  assert.equal((await post({ batch: true, examId: "exam-a" })).status, 403);
  reset({ userId: "u-other-teacher", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" });
  assert.equal((await post({ batch: true, examId: "exam-a" })).status, 403);
  reset({ userId: "u-parent", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" });
  assert.equal((await post({ batch: true, examId: "exam-a" })).status, 403);
  assert.deepEqual(saved, []);
  assert.deepEqual(markQueries, []);
});

test("an assigned teacher's batch keeps the teacher subject filter", async () => {
  reset({ userId: "u-teacher", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" });
  const r = await post({ batch: true, examId: "exam-a", cursor: 40 });
  assert.equal(r.status, 200);
  assert.deepEqual(markQueries[0].where.subject, { teacherId: "u-teacher" });
  assert.equal(r.body.nextCursor, null);
});

test("an invalid cursor is refused", async () => {
  reset(principalA);
  assert.equal((await post({ batch: true, examId: "exam-a", cursor: -1 })).status, 400);
});

import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assessmentFixture } from "./assessment-fixture";
import { applySaveReceipt } from "../../src/lib/school-ai/exam-draft";

// SKAI-1883: an in-progress autosave asked for with `slim` answers without echoing the paper or the
// answers just sent, so its size no longer grows with the paper or the candidate's writing. Submits,
// deadline closes and callers that do not ask for `slim` keep the full receipt. Scope checks are unchanged.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: "STUDENT" | "TEACHER"; schoolId: string; campusId: string; email: string; accessVersion: number };
const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, cond]) => {
  if (cond && typeof cond === "object" && "in" in (cond as Row)) return (cond as { in: unknown[] }).in.includes(row[key]);
  return row[key] === cond;
});
const pick = (row: Row, select?: Row) => select ? Object.fromEntries(Object.keys(select).filter(key => key in row).map(key => [key, row[key]])) : { ...row };
const tables: Record<string, Row[]> = {};
const attemptReads: Array<Row | undefined> = [];
const model = (name: string) => {
  const rows = () => (tables[name] ??= []);
  const findFirst = async (args: { where?: Row; select?: Row } = {}) => {
    if (name === "schoolAiExamAttempt") attemptReads.push(args.select);
    const row = rows().find(r => matches(r, args.where)); return row ? pick(row, args.select) : null;
  };
  return {
    findFirst,
    findFirstOrThrow: async (args: { where?: Row; select?: Row } = {}) => { const row = await findFirst(args); if (!row) throw new Error("not found"); return row; },
    findMany: async (args: { where?: Row; select?: Row } = {}) => rows().filter(r => matches(r, args.where)).map(r => pick(r, args.select)),
    updateMany: async (args: { where?: Row; data: Row }) => { const hit = rows().filter(r => matches(r, args.where)); for (const r of hit) Object.assign(r, args.data, { updatedAt: new Date() }); return { count: hit.length }; },
    create: async (args: { data: Row }) => { rows().push(args.data); return args.data; },
    count: async (args: { where?: Row } = {}) => rows().filter(r => matches(r, args.where)).length,
  };
};
const db: Record<string, unknown> = new Proxy({}, { get: (cache: Record<string, unknown>, key: string) => {
  if (key === "$transaction") return async (fn: (tx: unknown) => unknown) => fn(db);
  if (key === "$executeRaw" || key === "$queryRaw") return async () => [];
  if (key === "then") return undefined;
  return (cache[key] ??= model(key));
} });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, fn: (tx: typeof db) => unknown) => fn(db), retryDatabaseTransaction: async (fn: () => unknown) => fn() } });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: db, RLS_ENABLED: false, tenantTransaction: async (fn: (tx: typeof db) => unknown) => fn(db), validateReferences: async () => undefined } });

const load = () => import("../../src/lib/school-ai/exam-service");
const user = (id: string, schoolId: string, campusId: string, role: User["role"] = "STUDENT"): User => ({ userId: id, role, schoolId, campusId, email: `${id}@example.invalid`, accessVersion: 0 });
const pupil = user("u-pupil-a", "school-a", "campus-a"), twin = user("u-pupil-b", "school-b", "campus-b"), teacher = user("u-teacher-a", "school-a", "campus-a", "TEACHER");
const paper = assessmentFixture("subject-1", "class-a").paper;
const essay = "Synthetic answer. ".repeat(500);

function seed() {
  for (const key of Object.keys(tables)) tables[key].length = 0;
  attemptReads.length = 0;
  for (const [u, studentId, classId] of [[pupil, "s-a", "class-a"], [twin, "s-b", "class-b"]] as const) {
    (tables.user ??= []).push({ id: u.userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role, isActive: true, accessVersion: 0 });
    (tables.student ??= []).push({ id: studentId, schoolId: u.schoolId, campusId: u.campusId, classId, studentUserId: u.userId, archivedAt: null, status: "active" });
  }
  const assignment = (id: string, schoolId: string, campusId: string, classId: string, studentIds: string[]) => ({ id, schoolId, campusId, classId, studentIds, status: "ACTIVE", mode: "STANDARD", version: 3, secureProfileId: null, secureProfileVersion: null, proctorPolicy: {}, paperSnapshot: paper, createdById: "u-teacher-a" });
  (tables.schoolAiExamAssignment ??= []).push(assignment("exam-a", "school-a", "campus-a", "class-a", ["s-a"]), assignment("exam-b", "school-b", "campus-b", "class-b", ["s-b"]));
  const attempt = (id: string, assignmentId: string, schoolId: string, campusId: string, studentId: string, userId: string) => ({ id, assignmentId, schoolId, campusId, studentId, userId, status: "IN_PROGRESS", pausedAt: null, sequence: 1, responses: { q1: "a1" }, startedAt: new Date(0), submittedAt: null, deadlineAt: new Date(Date.now() + 3_600_000), updatedAt: new Date(0) });
  (tables.schoolAiExamAttempt ??= []).push(attempt("att-a", "exam-a", "school-a", "campus-a", "s-a", pupil.userId), attempt("att-b", "exam-b", "school-b", "campus-b", "s-b", twin.userId));
}

test("a slim in-progress autosave omits the paper and answers, and does not re-read the answers", async () => {
  const { saveSchoolAiAttempt } = await load();
  seed();
  const small = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 2, responses: { q1: "a1", q3: "short" } }, undefined, { slim: true }) as Row;
  seed();
  const large = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 2, responses: { q1: "a1", q3: essay } }, undefined, { slim: true }) as Row;
  for (const receipt of [small, large]) {
    assert.equal("paper" in receipt, false); assert.equal("responses" in receipt, false);
    assert.deepEqual([receipt.id, receipt.status, receipt.sequence, receipt.accepted], ["att-a", "IN_PROGRESS", 2, true]);
  }
  const size = (receipt: Row) => JSON.stringify({ ...receipt, serverNow: "" }).length;
  assert.equal(size(small), size(large), "the receipt does not grow with the answer text");
  assert.ok(attemptReads.at(-1) && !("responses" in attemptReads.at(-1)!), "the post-save read selects no responses column");
  assert.deepEqual(tables.schoolAiExamAttempt[0].responses, { q1: "a1", q3: essay }, "the answers are still stored");
});

test("a replayed slim save stays slim; submit, the full default and closed attempts keep the full receipt (a deadline close also sets submit, so it takes the full path)", async () => {
  const { saveSchoolAiAttempt } = await load();
  seed();
  const replay = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 1, responses: { q1: "a1" } }, undefined, { slim: true }) as Row;
  assert.equal("paper" in replay, false); assert.equal(replay.accepted, true);
  seed();
  const legacy = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 2, responses: { q1: "a2" } }) as Row;
  assert.deepEqual(legacy.responses, { q1: "a2" }); assert.ok(legacy.paper, "callers without slim keep the full receipt");
  const submitted = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 3, responses: { q1: "a1" }, submit: true }, undefined, { slim: true }) as Row;
  assert.equal(submitted.status, "SUBMITTED"); assert.deepEqual(submitted.responses, { q1: "a1" }); assert.ok(submitted.paper);
  const finished = await saveSchoolAiAttempt(pupil as never, "exam-a", { sequence: 4, responses: { q1: "a2" } }, undefined, { slim: true }) as Row;
  assert.equal(finished.accepted, false); assert.deepEqual(finished.responses, { q1: "a1" }, "a closed attempt returns its saved answers");
});

test("slim saves keep tenant, campus and role scope", async () => {
  const { saveSchoolAiAttempt } = await load();
  seed();
  await assert.rejects(() => saveSchoolAiAttempt(twin as never, "exam-a", { sequence: 2, responses: { q1: "a2" } }, undefined, { slim: true }), { status: 404 }, "school B cannot save into school A's exam");
  await assert.rejects(() => saveSchoolAiAttempt({ ...pupil, campusId: "campus-b" } as never, "exam-a", { sequence: 2, responses: { q1: "a2" } }, undefined, { slim: true }), { status: 404 }, "another campus cannot save");
  await assert.rejects(() => saveSchoolAiAttempt(teacher as never, "exam-a", { sequence: 2, responses: { q1: "a2" } }, undefined, { slim: true }));
  const other = await saveSchoolAiAttempt(twin as never, "exam-b", { sequence: 2, responses: { q1: "a2" } }, undefined, { slim: true }) as Row;
  assert.equal(other.id, "att-b");
  assert.deepEqual(tables.schoolAiExamAttempt[0].responses, { q1: "a1" }, "school A's attempt is untouched");
});

test("the player keeps its paper and records the sent answers from a slim receipt", () => {
  const current = { id: "att-a", status: "IN_PROGRESS", sequence: 1, serverNow: "t0", paper: { questions: [1] }, responses: { q1: "a1" } };
  const sent = { q1: "a2", q3: "x" };
  const merged = applySaveReceipt(current, { id: "att-a", status: "IN_PROGRESS", sequence: 2, serverNow: "t1" }, sent);
  assert.deepEqual(merged, { id: "att-a", status: "IN_PROGRESS", sequence: 2, serverNow: "t1", paper: current.paper, responses: sent });
  const full = { ...current, status: "SUBMITTED", sequence: 2, responses: { q1: "a1" } };
  assert.equal(applySaveReceipt(current, full, sent), full, "a full receipt replaces the attempt as before");
});

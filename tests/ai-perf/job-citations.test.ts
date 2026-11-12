import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1884: reading a run checks the citations of every step with one readable-documents query (scoped to the
// reader's school, campus and role), not one per cited step. A step whose source changed or is no longer
// readable still has its answer withheld; a reader without knowledge access is still refused.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };
const ragQueries: Row[] = [];
let job: Row | null = null;
const docs = [
  { id: "doc-1", version: 2, schoolId: "school-a", campusId: null, roles: ["TEACHER"] },
  { id: "doc-2", version: 1, schoolId: "school-a", campusId: "campus-a", roles: ["TEACHER"] },
  { id: "doc-3", version: 1, schoolId: "school-a", campusId: "campus-a", roles: ["PRINCIPAL"] },
  { id: "doc-9", version: 1, schoolId: "school-b", campusId: null, roles: ["TEACHER"] },
];
const readable = (doc: Row, where: Row) => doc.schoolId === where.schoolId && (doc.roles as string[]).includes(where.role as string) && (doc.campusId === null || doc.campusId === where.campusId);
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {
  aiWorkflowJob: { findFirst: async (args: { where: Row }) => job && job.id === args.where.id && job.schoolId === args.where.schoolId && job.actorId === args.where.actorId ? structuredClone(job) : null },
  aiWorkflowSegment: { findFirst: async () => ({ text: "What is the policy?" }) },
  ragDocument: { findMany: async (args: { where: Row & { OR: Array<{ id: string; version: number }> } }) => {
    ragQueries.push(args.where);
    return docs.filter(doc => readable(doc, args.where) && args.where.OR.some(c => c.id === doc.id && c.version === doc.version)).map(doc => ({ id: doc.id, version: doc.version }));
  } },
} } });
mock.module(src("lib/ai-workflows/jobs/actor.ts"), { namedExports: { inTenant: (_u: unknown, work: () => unknown) => work(), authorizeActor: async () => undefined, capabilityContext: async () => ({}), resolveJobActor: () => null } });
mock.module(src("lib/rag/service.ts"), { namedExports: {
  readableWhere: (user: User) => ({ schoolId: user.schoolId, campusId: user.campusId, role: user.role }),
  assertKnowledgeAccess: async (user: User) => { if (user.role === "STUDENT") throw new Error("Insufficient permissions."); },
} });

const getJob = async (user: User, id: string) => (await import("../../src/lib/ai-workflows/jobs/job-service")).getJob(user as never, id);
const teacher: User = { userId: "t-a", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
const cite = (...sources: Array<[string, number]>) => ({ detail: { text: "Answer", citations: sources.map(([documentId, version]) => ({ documentId, version })) } });
const withheld = "This answer used a source that changed or is no longer available to you. Ask again for current information.";
const runOf = (user: User, steps: Array<Row | null>) => ({ id: "job-1", schoolId: user.schoolId, actorId: user.userId, parentJobId: null, steps: steps.map((receipt, i) => ({ id: `step-${i}`, receipt })), handoffs: [], questions: [] });
const texts = (result: { steps: Array<{ receipt: unknown }> }) => result.steps.map(step => (step.receipt as { detail?: { text?: string } } | null)?.detail?.text ?? null);

test.beforeEach(() => { ragQueries.length = 0; });

test("every cited step is checked with one scoped query, and only stale or unreadable answers are withheld", async () => {
  job = runOf(teacher, [cite(["doc-1", 2]), { detail: { text: "No sources" } }, cite(["doc-2", 1], ["doc-1", 2]), cite(["doc-1", 1]), cite(["doc-3", 1]), cite(["doc-9", 1]), null]);
  const result = await getJob(teacher, "job-1");
  assert.equal(ragQueries.length, 1, "one query however many steps cite sources");
  assert.equal(ragQueries[0].schoolId, "school-a");
  assert.equal((ragQueries[0].OR as unknown[]).length, 6);
  assert.deepEqual(texts(result), ["Answer", "No sources", "Answer", withheld, withheld, withheld, null]);
});

test("a run without citations makes no knowledge query", async () => {
  job = runOf(teacher, [{ detail: { text: "Plain" } }, null]);
  assert.deepEqual(texts(await getJob(teacher, "job-1")), ["Plain", null]);
  assert.equal(ragQueries.length, 0);
});

test("another school's reader and another campus's reader are scoped to their own documents", async () => {
  const other: User = { userId: "t-b", role: "TEACHER", schoolId: "school-b", campusId: "campus-b" };
  job = runOf(other, [cite(["doc-9", 1]), cite(["doc-1", 2])]);
  assert.deepEqual(texts(await getJob(other, "job-1")), ["Answer", withheld]);
  const campusZ: User = { userId: "t-z", role: "TEACHER", schoolId: "school-a", campusId: "campus-z" };
  job = runOf(campusZ, [cite(["doc-1", 2]), cite(["doc-2", 1])]);
  assert.deepEqual(texts(await getJob(campusZ, "job-1")), ["Answer", withheld]);
  await assert.rejects(getJob(teacher, "job-1"), (error: Error) => /NOT_FOUND/.test(String((error as { code?: string }).code ?? error.message)));
});

test("a reader without knowledge access is still refused when a step cites sources", async () => {
  const pupil: User = { userId: "s-a", role: "STUDENT", schoolId: "school-a", campusId: "campus-a" };
  job = runOf(pupil, [cite(["doc-1", 2])]);
  await assert.rejects(getJob(pupil, "job-1"), /Insufficient permissions/);
  assert.equal(ragQueries.length, 0);
});

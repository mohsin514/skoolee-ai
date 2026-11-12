import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// SKAI-1841: listing runs checks every step of every run against one permission snapshot and two batched,
// school/campus-scoped loads (records, approved revisions), however many runs and steps exist. A run whose
// step fails a 403/404 is still dropped on its own; other errors still fail the request.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string; accessVersion: number };
const counts: Record<string, number> = {};
const hit = (name: string) => { counts[name] = (counts[name] ?? 0) + 1; };
const tables: Record<string, Row[]> = {};
const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, cond]) => {
  if (key === "OR") return (cond as Row[]).some(w => matches(row, w));
  if (cond && typeof cond === "object" && "in" in (cond as Row)) return ((cond as { in: unknown[] }).in).includes(row[key]);
  return row[key] === cond;
});
const pick = (row: Row, select?: Row) => select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : { ...row };
const model = (name: string) => ({
  findMany: async (args: { where?: Row; select?: Row; take?: number } = {}) => { hit(`${name}.findMany`); return tables[name].filter(r => matches(r, args.where)).slice(0, args.take ?? Infinity).map(r => pick(r, args.select)); },
  findFirst: async (args: { where?: Row; select?: Row } = {}) => { hit(`${name}.findFirst`); const row = tables[name].find(r => matches(r, args.where)); return row ? pick(row, args.select) : null; },
});
const tx = Object.fromEntries(["schoolAiRun", "schoolAiRevision", "schoolAiExecution", "user"].map(n => [n, model(n)]));
class SchoolAiError extends Error { constructor(message: string, public status = 400, public code?: string) { super(message); } }
const denied = new Set<string>();

mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module(src("lib/billing/entitlements.ts"), { namedExports: { assertSchoolOperational: async () => undefined, BillingAccessError: class extends Error {} } });
mock.module(src("lib/school-ai/access.ts"), { namedExports: {
  SchoolAiError, assertApprovalRole: () => undefined, assertSchoolAiAccess: async () => undefined, resolveWorkerPrincipal: async () => null,
  resolveWorkspaceCampus: async (_u: unknown, campusId: string) => campusId,
  loadWorkspacePermissionSnapshot: async () => { hit("permissions"); return new Map(); },
  assertWorkspaceDomainPermission: async (_u: unknown, _k: unknown, data: Row) => { if (data.revoked) throw new SchoolAiError("Insufficient permissions.", 403); },
  assertWorkspaceSubject: async (_u: unknown, _c: unknown, data: Row) => { hit("subject"); if (data.subjectId === "gone") throw new SchoolAiError("Outside teaching access.", 403); },
} });
mock.module(src("lib/school-ai/execution.ts"), { namedExports: {
  executionOperationSchema: z.string(), executeSchoolAiToolInTransaction: async () => null, previewSchoolAiExecution: async () => null,
  assertSchoolAiOperationAccess: async (_u: unknown, operation: string, _db: unknown, permissions?: unknown) => { hit("operation"); assert.ok(permissions, "the list reuses one permission snapshot"); if (denied.has(operation)) throw new SchoolAiError("Denied.", 403); },
} });
mock.module(src("lib/school-ai/school-setup-service.ts"), { namedExports: { assertSchoolSetupRecordAccess: async () => { hit("setup"); } } });
mock.module(src("lib/school-ai/repository.ts"), { namedExports: {
  workspaceRequestHash: () => "hash", getWorkspaceRecordInTransaction: async () => { throw new Error("the list must not load records one by one"); },
  workspaceRecordReader: async (user: User, ids: string[]) => {
    hit("records");
    const rows = tables.schoolAiRecord.filter(r => ids.includes(r.id as string) && r.schoolId === user.schoolId && (user.role === "SUPER_ADMIN" || r.campusId === user.campusId));
    return async (id: string) => { const row = rows.find(r => r.id === id); if (!row) throw new SchoolAiError("Workspace item not found or no longer accessible.", 404); return row; };
  },
} });

const listSchoolRuns = async (...args: Parameters<typeof import("../../src/lib/school-ai/run-service").listSchoolRuns>) => (await import("../../src/lib/school-ai/run-service")).listSchoolRuns(...args);
const admin: User = { userId: "u-admin", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a", accessVersion: 0 };
const hash = "a".repeat(64);
const step = (recordId: string, operation = "academics.setup_year") => ({ recordId, version: 1, operation, previewHash: hash });
const run = (id: string, steps: Row[], over: Row = {}) => ({ id, schoolId: "school-a", campusId: "campus-a", title: `Run ${id}`, status: "QUEUED", version: 1, steps, nextStep: 0, receipts: [], errorCode: null, actorId: "u-admin", scheduledAt: new Date(0), expiresAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), completedAt: null, ...over });
const record = (id: string, over: Row = {}) => ({ id, schoolId: "school-a", campusId: "campus-a", kind: "WORKFLOW", version: 1, status: "APPROVED", ...over });
const revision = (recordId: string, data: Row = {}, over: Row = {}) => ({ recordId, schoolId: "school-a", campusId: "campus-a", version: 1, status: "APPROVED", data, ...over });

function seed(runCount: number, stepsPerRun: number) {
  for (const key of Object.keys(counts)) delete counts[key];
  denied.clear();
  const ids = Array.from({ length: runCount * stepsPerRun }, (_, i) => `rec-${i}`);
  tables.schoolAiRecord = ids.map(id => record(id));
  tables.schoolAiRevision = ids.map(id => revision(id, { subjectId: "math", classId: "c-1" }));
  tables.schoolAiRun = Array.from({ length: runCount }, (_, r) => run(`run-${r}`, ids.slice(r * stepsPerRun, (r + 1) * stepsPerRun).map(id => step(id))));
  tables.schoolAiExecution = [];
  tables.user = [{ id: "u-admin", schoolId: "school-a", campusId: "campus-a", role: "CAMPUS_ADMIN", isActive: true, accessVersion: 0, fullName: "Synthetic admin" }];
}
const total = () => Object.values(counts).reduce((a, b) => a + b, 0);

test("listing runs makes the same number of checks for 1 run of 1 step as for 100 runs of 20 steps", async () => {
  seed(1, 1); assert.equal((await listSchoolRuns(admin as never, "campus-a")).length, 1); const small = total();
  seed(100, 20); assert.equal((await listSchoolRuns(admin as never, "campus-a")).length, 100); const large = total();
  assert.equal(large, small);
  assert.equal(counts["schoolAiRevision.findMany"], 1); assert.equal(counts.records, 1); assert.equal(counts.operation, 1); assert.equal(counts.subject, 1);
  assert.equal(counts["schoolAiRevision.findFirst"] ?? 0, 0);
  assert.equal(counts.permissions, 2, "one snapshot for the access gate and one shared by every step");
});

test("each inaccessible run is dropped on its own and the rest are still shown", async () => {
  seed(6, 2);
  tables.schoolAiRevision = tables.schoolAiRevision.filter(r => r.recordId !== "rec-0"); // run-0: pinned revision gone (404)
  tables.schoolAiRecord = tables.schoolAiRecord.filter(r => r.id !== "rec-3"); // run-1: record gone (404)
  tables.schoolAiRevision.find(r => r.recordId === "rec-4")!.data = { revoked: true }; // run-2: domain grant revoked (403)
  tables.schoolAiRevision.find(r => r.recordId === "rec-7")!.data = { subjectId: "gone", classId: "c-1" }; // run-3: subject left (403)
  tables.schoolAiRun[4].steps = [step("rec-8", "fees.generate_invoices"), step("rec-9")]; denied.add("fees.generate_invoices"); // run-4: operation denied
  const listed = await listSchoolRuns(admin as never, "campus-a");
  assert.deepEqual(listed.map(r => r.id), ["run-5"]);
});

test("a shared failing check hides every run that needs it, and a later poll re-checks access", async () => {
  seed(3, 1);
  tables.schoolAiRun = tables.schoolAiRun.map(r => ({ ...r, steps: [step("rec-0")] }));
  tables.schoolAiRevision.find(r => r.recordId === "rec-0")!.data = { revoked: true };
  assert.deepEqual(await listSchoolRuns(admin as never, "campus-a"), []);
  tables.schoolAiRevision.find(r => r.recordId === "rec-0")!.data = {};
  assert.equal((await listSchoolRuns(admin as never, "campus-a")).length, 3);
  tables.schoolAiRevision.find(r => r.recordId === "rec-0")!.data = { revoked: true };
  assert.deepEqual(await listSchoolRuns(admin as never, "campus-a"), [], "revoked access disappears on the next poll");
});

test("batched loads stay inside the caller's school and campus", async () => {
  seed(2, 1);
  // The other school holds the same record id and an approved revision; the other campus has one too.
  tables.schoolAiRecord.push(record("rec-x", { schoolId: "school-b", campusId: "campus-b" }));
  tables.schoolAiRevision.push(revision("rec-x", {}, { schoolId: "school-b", campusId: "campus-b" }), revision("rec-y", {}, { campusId: "campus-other" }));
  tables.schoolAiRecord.push(record("rec-y", { campusId: "campus-other" }));
  tables.schoolAiRun.push(run("run-x", [step("rec-x")]), run("run-y", [step("rec-y")]));
  assert.deepEqual((await listSchoolRuns(admin as never, "campus-a")).map(r => r.id).sort(), ["run-0", "run-1"]);
  const other: User = { ...admin, schoolId: "school-b", campusId: "campus-b" };
  tables.user.push({ ...tables.user[0], schoolId: "school-b", campusId: "campus-b" });
  tables.schoolAiRun.find(r => r.id === "run-x")!.schoolId = "school-b"; tables.schoolAiRun.find(r => r.id === "run-x")!.campusId = "campus-b";
  assert.deepEqual((await listSchoolRuns(other as never, "campus-b")).map(r => r.id), ["run-x"]);
});

test("a step whose record moved campus still fails the whole list instead of being hidden", async () => {
  seed(2, 1);
  const owner: User = { ...admin, role: "SUPER_ADMIN" }; tables.user = [{ ...tables.user[0], role: "SUPER_ADMIN" }];
  tables.schoolAiRecord.find(r => r.id === "rec-1")!.campusId = "campus-b";
  await assert.rejects(() => listSchoolRuns(owner as never, "campus-a"), { status: 409 });
});

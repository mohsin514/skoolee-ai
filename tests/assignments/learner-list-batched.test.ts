import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1816: the learner and guardian assignment list loads in a fixed number of school-scoped
// queries however many assignments exist, and shows exactly what opening each assignment shows.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string };
const NOW = new Date("2026-10-20T12:00:00Z"), PAST = new Date("2026-10-01T00:00:00Z"), LATER = new Date("2026-11-01T00:00:00Z");
const tables: Record<string, Row[]> = {};
let queries = 0;

// A tiny in-memory Prisma: equality, in, not, gt, lt, OR/AND, orderBy, select, take and the submission include.
const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, cond]) => {
  if (key === "OR") return (cond as Row[]).some(w => matches(row, w));
  if (key === "AND") return (cond as Row[]).every(w => matches(row, w));
  const value = row[key];
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    const c = cond as { in?: unknown[]; not?: unknown; gt?: number; lt?: unknown };
    if (c.in && !c.in.includes(value)) return false;
    if ("not" in c && value === c.not) return false;
    if (c.gt !== undefined && !((value as number) > c.gt)) return false;
    if (c.lt !== undefined && !((value as never) < (c.lt as never))) return false;
    return true;
  }
  return value === cond;
});
const sortBy = (rows: Row[], orderBy?: Row | Row[]) => {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map(o => Object.entries(o)[0] as [string, "asc" | "desc"]);
  return [...rows].sort((a, b) => { for (const [k, dir] of keys) { const x = a[k] as never, y = b[k] as never; if (x < y) return dir === "asc" ? -1 : 1; if (x > y) return dir === "asc" ? 1 : -1; } return 0; });
};
const shape = (name: string, row: Row, args: { select?: Row; include?: Row }) => {
  if (args.select) return Object.fromEntries(Object.keys(args.select).map(k => [k, row[k]]));
  if (name === "assignmentSubmission" && args.include) return { ...row, versions: sortBy(tables.versions.filter(v => v.submissionId === row.id), { version: "desc" }).map(v => ({ ...v, feedback: tables.feedback.find(f => f.submissionVersionId === v.id) ?? null })) };
  return { ...row };
};
const model = (name: string) => ({
  findMany: async (args: { where?: Row; orderBy?: Row | Row[]; take?: number; select?: Row; include?: Row } = {}) => {
    queries++;
    return sortBy(tables[name].filter(r => matches(r, args.where)), args.orderBy).slice(0, args.take ?? Infinity).map(r => shape(name, r, args));
  },
  findFirst: async (args: { where?: Row; select?: Row; include?: Row } = {}) => {
    queries++;
    const row = tables[name].find(r => matches(r, args.where));
    return row ? shape(name, row, args) : null;
  },
});
const tx = Object.fromEntries(["assignment", "assignmentVersion", "assignmentSubmission", "assignmentRubricVersion", "assignmentExtension", "learningResource", "student"].map(n => [n, model(n)]));
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError, canManageOperations: () => false } });
mock.module(src("lib/auth/policy.ts"), { namedExports: { studentScope: (u: User) => ({ schoolId: u.schoolId, guardians: u.userId }) } });
mock.module(src("lib/chat/policy.ts"), { namedExports: { teacherClassIds: async () => [] } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module(src("lib/storage/private-upload.ts"), { namedExports: { createPrivateUploadUrl: async () => "", MAX_PRIVATE_UPLOAD_BYTES: 1 } });
mock.module(src("lib/storage/s3.ts"), { namedExports: { readPrivateObject: async () => null } });
mock.module(src("lib/curriculum/service.ts"), { namedExports: { assertObjectivesExist: async () => undefined } });
mock.module(src("lib/locale/store.ts"), { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });

const student: User = { userId: "u-ali", role: "STUDENT", schoolId: "school-a", campusId: "campus-a" };
const parent: User = { userId: "u-parent", role: "PARENT", schoolId: "school-a", campusId: "campus-a" };
const otherSchool: User = { userId: "u-ali", role: "STUDENT", schoolId: "school-b", campusId: "campus-b" };
const rubric = [{ id: "c1", title: "Claim", description: "States a claim.", maxPoints: 4 }];

function seed(extra = 0) {
  queries = 0;
  const pupil = (id: string, classId: string, userId: string) => ({ id, schoolId: "school-a", classId, archivedAt: null, fullName: `Synthetic ${id}`, studentUserId: userId, guardians: "u-parent" });
  tables.student = [pupil("s-ali", "c-6a", "u-ali"), pupil("s-sara", "c-4b", "u-sara")];
  tables.assignment = []; tables.assignmentVersion = []; tables.assignmentRubricVersion = []; tables.assignmentSubmission = []; tables.versions = []; tables.feedback = []; tables.assignmentExtension = [];
  tables.learningResource = [
    { id: "r-6a", schoolId: "school-a", classId: "c-6a", status: "PUBLISHED", audience: "CLASS", title: "Lab sheet" },
    { id: "r-draft", schoolId: "school-a", classId: "c-6a", status: "DRAFT", audience: "CLASS", title: "Hidden" },
  ];
  let n = 0;
  const assign = (id: string, schoolId: string, classId: string, audience: string[], opts: { status?: string; opensAt?: Date; resourceIds?: string[] } = {}) => {
    const status = opts.status ?? "RELEASED", updatedAt = new Date(PAST.getTime() + ++n * 1000);
    tables.assignment.push({ id, schoolId, campusId: "campus-a", classId, status, currentVersion: status === "DRAFT" ? null : 1, updatedAt, dueLocal: null, title: id });
    if (status === "DRAFT") return;
    tables.assignmentVersion.push({ id: `${id}-v1`, schoolId, assignmentId: id, version: 1, audience, opensAt: opts.opensAt ?? PAST, dueAt: new Date(PAST.getTime() + n * 86_400_000), dueLocal: "2026-10-30T23:00", timezone: "UTC", title: `Released ${id}`, instructions: "Synthetic instructions", rubricVersion: 1, submissionMode: "ONLINE", allowedTypes: ["PDF"], latePolicy: "ACCEPT_FLAGGED", resubmission: "AFTER_RETURN", resourceIds: opts.resourceIds ?? [] });
    tables.assignmentRubricVersion.push({ id: `${id}-r1`, schoolId, assignmentId: id, version: 1, criteria: rubric, totalPoints: 4, createdAt: PAST });
  };
  assign("a-open", "school-a", "c-6a", ["s-ali"], { resourceIds: ["r-6a", "r-draft"] });
  assign("a-sara", "school-a", "c-4b", ["s-sara"]);
  assign("a-draft", "school-a", "c-6a", ["s-ali"], { status: "DRAFT" });
  assign("a-future", "school-a", "c-6a", ["s-ali"], { opensAt: LATER });
  assign("a-group", "school-a", "c-6a", ["s-other"]);
  assign("a-left", "school-a", "c-old", ["s-old"], { status: "CLOSED" });
  assign("b-same-class", "school-b", "c-6a", ["s-ali"]);
  for (let i = 0; i < extra; i++) assign(`a-extra-${i}`, "school-a", "c-6a", ["s-ali"]);
  const submit = (id: string, schoolId: string, assignmentId: string, studentId: string) => {
    tables.assignmentSubmission.push({ id, schoolId, assignmentId, studentId, latestVersion: 1, status: "RETURNED", draftText: "draft", draftSavedAt: null, draftUploadedAt: null, draftStorageKey: null });
    tables.versions.push({ id: `${id}-v1`, schoolId, submissionId: id, version: 1, receiptCode: "R-1", mode: "ONLINE", submittedAt: PAST, receivedAt: PAST, late: false, effectiveDueAt: PAST, assignmentVersion: 1, rubricVersion: 1, text: "My answer", storageKey: null });
    tables.feedback.push({ submissionVersionId: `${id}-v1`, status: "RETURNED", criteria: [], comment: "Well done", totalPoints: 3, returnedAt: PAST, rubricVersion: 1 });
  };
  submit("sub-open", "school-a", "a-open", "s-ali");
  submit("sub-left", "school-a", "a-left", "s-ali"); // took part, then left the class: still readable
  submit("sub-foreign", "school-b", "a-open", "s-ali"); // another school's row never leaks in
  tables.assignmentExtension.push({ id: "ext-1", schoolId: "school-a", assignmentId: "a-open", studentId: "s-ali", dueAt: LATER, dueLocal: "2026-11-01T00:00", reason: "Synthetic", createdAt: PAST });
  tables.assignmentExtension.push({ id: "ext-b", schoolId: "school-b", assignmentId: "a-open", studentId: "s-ali", dueAt: LATER, dueLocal: "2026-11-09T00:00", reason: "Foreign", createdAt: NOW });
}
const service = () => import("../../src/lib/assignments/service");

test("a student sees released, opened work addressed to them plus work they took part in after leaving", async () => {
  seed();
  const { listAssignments, getAssignment } = await service();
  const listed = await listAssignments(student as never, {}, NOW);
  assert.equal(listed.mode, "learner");
  const items = listed.assignments as Awaited<ReturnType<typeof getAssignment>>["assignment"][] as Row[];
  assert.deepEqual(items.map(i => i.id).sort(), ["a-left", "a-open"]);
  const open = items.find(i => i.id === "a-open")!;
  assert.deepEqual(open.resources, [{ id: "r-6a", title: "Lab sheet" }]);
  assert.equal((open.extension as Row).reason, "Synthetic");
  assert.equal(items.find(i => i.id === "a-left")!.enrolled, false);
  // Every listed item is exactly what opening that assignment on its own returns.
  for (const item of items) assert.deepEqual(item, (await getAssignment(student as never, item.id as string, NOW)).assignment);
});

test("the list costs the same number of queries for 7 or 67 assignments", async () => {
  const { listAssignments } = await service();
  seed(); await listAssignments(student as never, {}, NOW); const small = queries;
  seed(60); const many = await listAssignments(student as never, {}, NOW);
  assert.equal(many.assignments.length, 62);
  assert.equal(queries, small);
  assert.ok(small <= 8, `expected a fixed handful of queries, got ${small}`);
});

test("a parent sees each sibling's own work once; another school's learner sees none of it", async () => {
  seed();
  const { listAssignments } = await service();
  const family = await listAssignments(parent as never, {}, NOW);
  assert.equal(family.mode, "guardian");
  assert.deepEqual((family.assignments as Row[]).map(i => `${i.id}:${i.studentId}`).sort(), ["a-left:s-ali", "a-open:s-ali", "a-sara:s-sara"]);
  for (const item of family.assignments as Row[]) { assert.equal(item.draft, null); assert.equal(item.canSubmit, false); }
  const foreign = await listAssignments(otherSchool as never, {}, NOW);
  assert.deepEqual(foreign.assignments, []);
});

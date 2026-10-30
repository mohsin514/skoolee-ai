import { mock, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

// SKAI-193: offline class edits. The service runs over an in-memory store that keeps the real unique key
// (school_id, operation_id), so replay, stale versions and tenant isolation are checked without a database.
type Row = Record<string, unknown> & { id: string; schoolId: string };
const db = { classes: [] as Row[], ops: [] as Row[] };
const match = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === "object" && !(v instanceof Date) && "gt" in v) return (row[k] as Date) > (v as { gt: Date }).gt;
  if (v && typeof v === "object" && !(v instanceof Date)) return true; // campus scope objects are not modelled
  return row[k] === v;
});
const fake = {
  class: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.classes.find(r => match(r, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => db.classes.filter(r => match(r, where)).sort((a, b) => +(a.updatedAt as Date) - +(b.updatedAt as Date)),
  },
  offlineOperation: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.ops.find(r => match(r, where)) ?? null,
    findFirstOrThrow: async ({ where }: { where: Record<string, unknown> }) => db.ops.find(r => match(r, where))!,
    create: async ({ data }: { data: Row }) => {
      if (db.ops.some(r => r.schoolId === data.schoolId && r.operationId === data.operationId)) throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
      db.ops.push({ ...data, id: `op-${db.ops.length}` }); return data;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.ops.find(r => r.id === where.id)!, data),
  },
};
let tick = Date.parse("2026-10-30T08:00:00.000Z");
mock.module(import.meta.resolve("../../src/lib/db/prisma.ts"), { namedExports: { prisma: fake } });
mock.module(import.meta.resolve("../../src/lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => unknown) => fn(fake) } });
mock.module(import.meta.resolve("../../src/lib/timetable/locking.ts"), { namedExports: { lockTimetableCampus: async () => undefined } });
mock.module(import.meta.resolve("../../src/lib/api/teacher-assignments.ts"), { namedExports: { updateClassWithTeacherAssignmentTx: async (_tx: unknown, user: { schoolId: string }, body: Record<string, unknown>) => {
  const row = db.classes.find(r => r.id === body.id && r.schoolId === user.schoolId)!;
  for (const k of ["name", "section", "capacity"]) if (body[k] !== undefined) row[k] = body[k];
  row.updatedAt = new Date(tick += 1000);
  return { cls: row };
} } });
const { invalidClassEdit, isStale, syncClassEdits, resolveClassEdit, classChanges } = await import("../../src/lib/offline/class-sync");
const { mergeClassChanges, queueClassEdit } = await import("../../src/lib/offline/store");

const admin = (schoolId = "school-a", userId = "admin-a") => ({ userId, schoolId, campusId: `${schoolId}-campus`, role: "CAMPUS_ADMIN", fullName: "Synthetic admin" }) as never;
const v0 = new Date("2026-10-30T07:00:00.000Z");
const edit = (operationId: string, payload: Record<string, unknown>, base = v0.toISOString(), classId = "class-a") => ({ operationId, kind: "CLASS_EDIT", classId, capturedAt: new Date().toISOString(), baseUpdatedAt: base, payload });
const sync = (user: never, ...ops: unknown[]) => syncClassEdits(user, { deviceId: "device-1234", operations: ops });
beforeEach(() => {
  db.classes = [
    { id: "class-a", schoolId: "school-a", campusId: "school-a-campus", name: "Grade 1", section: "A", capacity: 30, updatedAt: v0, archivedAt: null },
    { id: "class-b", schoolId: "school-b", campusId: "school-b-campus", name: "Grade 1", section: "A", capacity: 30, updatedAt: v0, archivedAt: null },
  ];
  db.ops = [];
});

test("shape checks refuse unsupported fields, bad ids and stale captures", () => {
  const now = Date.now();
  assert.equal(invalidClassEdit(edit("op-valid-1", { name: "Grade 2" }) as never, now), null);
  assert.match(invalidClassEdit(edit("op-valid-1", { academicYear: 2027 }) as never, now)!, /name, section and capacity/);
  assert.match(invalidClassEdit(edit("bad id!", { name: "x" }) as never, now)!, /not a supported/);
  assert.match(invalidClassEdit(edit("op-valid-1", { name: "  " }) as never, now)!, /name is required/);
  assert.match(invalidClassEdit({ ...edit("op-valid-1", { name: "x" }), capturedAt: new Date(now - 4 * 86_400_000).toISOString() } as never, now)!, /older than 3 days/);
  assert.equal(isStale(v0.toISOString(), v0), false);
  assert.equal(isStale(v0.toISOString(), new Date(v0.getTime() + 1)), true);
});

test("a replayed operation is applied once and returns its first outcome", async () => {
  const first = await sync(admin(), edit("op-replay-1", { section: "B" }));
  assert.equal(first.outcomes[0].status, "ACCEPTED");
  const version = db.classes[0].updatedAt;
  const again = await sync(admin(), edit("op-replay-1", { section: "C" }), edit("op-replay-1", { section: "C" }));
  assert.deepEqual(again.outcomes.map(o => [o.status, o.repeated]), [["ACCEPTED", true], ["ACCEPTED", true]]);
  assert.equal(db.classes[0].section, "B");
  assert.equal(db.classes[0].updatedAt, version);
  assert.equal(db.ops.length, 1);
});

test("a stale base becomes a conflict with the server value; apply-mine over a moved class is 409", async () => {
  db.classes[0].updatedAt = new Date(tick += 1000); db.classes[0].name = "Grade 1 (office)";
  const r = await sync(admin(), edit("op-stale-01", { name: "Grade One" }));
  assert.equal(r.outcomes[0].status, "CONFLICT");
  assert.equal((r.outcomes[0].server as { name: string }).name, "Grade 1 (office)");
  assert.equal(db.classes[0].name, "Grade 1 (office)");
  db.classes[0].updatedAt = new Date(tick += 1000);
  await assert.rejects(resolveClassEdit(admin(), { operationId: "op-stale-01", decision: "APPLY_LOCAL" }), (e: { status: number }) => e.status === 409);
  // After seeing the latest value (refreshed onto the record by the 409), applying mine succeeds.
  const done = await resolveClassEdit(admin(), { operationId: "op-stale-01", decision: "APPLY_LOCAL" });
  assert.equal(done.status, "RESOLVED_LOCAL");
  assert.equal(db.classes[0].name, "Grade One");
  await assert.rejects(resolveClassEdit(admin(), { operationId: "op-stale-01", decision: "KEEP_SERVER" }), (e: { status: number }) => e.status === 409);
});

test("another tenant or account can neither replay nor resolve an operation", async () => {
  await sync(admin(), edit("op-tenant-1", { capacity: 32 }));
  // School B reusing the id is a separate operation in its own school and cannot touch school A's class.
  const other = await sync(admin("school-b", "admin-b"), edit("op-tenant-1", { capacity: 40 }));
  assert.equal(other.outcomes[0].status, "REJECTED_ACCESS");
  assert.equal(db.classes[0].capacity, 32);
  assert.equal(db.classes[1].capacity, 30);
  const sameSchool = await sync(admin("school-a", "admin-a2"), edit("op-tenant-1", { capacity: 50 }));
  assert.equal(sameSchool.outcomes[0].status, "INVALID");
  db.classes[0].updatedAt = new Date(tick += 1000);
  assert.equal((await sync(admin(), edit("op-only-a1", { capacity: 33 }))).outcomes[0].status, "CONFLICT");
  for (const intruder of [admin("school-b", "admin-b"), admin("school-a", "admin-a2")]) await assert.rejects(resolveClassEdit(intruder, { operationId: "op-only-a1", decision: "KEEP_SERVER" }), (e: { status: number }) => e.status === 404);
  const teacher = { ...(admin() as object), role: "TEACHER" } as never;
  await assert.rejects(sync(teacher, edit("op-teacher1", { name: "x" })), (e: { status: number }) => e.status === 403);
});

test("the reconnect cursor returns only classes changed since it, for this school", async () => {
  const all = await classChanges(admin(), null);
  assert.deepEqual(all.items.map(i => i.id), ["class-a"]);
  assert.equal((await classChanges(admin(), all.cursor)).items.length, 0);
  await sync(admin(), edit("op-cursor-1", { section: "D" }));
  const next = await classChanges(admin(), all.cursor);
  assert.deepEqual(next.items.map(i => [i.id, i.section]), [["class-a", "D"]]);
  await assert.rejects(classChanges(admin(), "not-a-date"), (e: { status: number }) => e.status === 400);
});

test("device queue folds unsent edits, keeps a fresh id once sent, and the cursor never moves back", () => {
  const row = { id: "class-a", name: "Grade 1", section: "A", capacity: 30, updatedAt: v0.toISOString(), archived: false };
  let ids = 0; const id = () => `id-${++ids}`;
  let b = queueClassEdit({ snapshots: {}, ops: [] }, row, { name: "Grade 2" }, id);
  b = queueClassEdit(b, row, { section: "B" }, id);
  assert.equal(b.classOps!.length, 1);
  assert.deepEqual(b.classOps![0].payload, { name: "Grade 2", section: "B" });
  b = { ...b, classOps: b.classOps!.map(o => ({ ...o, sent: true })) };
  b = queueClassEdit(b, row, { capacity: 31 }, id);
  assert.deepEqual(b.classOps!.map(o => o.operationId), ["id-1", "id-2"]);
  const m = mergeClassChanges(b, [row], "2026-10-30T09:00:00.000Z");
  assert.equal(mergeClassChanges(m, [], "2026-10-30T08:00:00.000Z").classCursor, "2026-10-30T09:00:00.000Z");
});

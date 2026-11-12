import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1824: the pickup gate queue loads in a fixed number of school-scoped queries however many checks
// there are today, and each row shows the same student, recipient, authorizer and restriction as before.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string | null };
const tables: Record<string, Row[]> = {};
const log: { model: string; where: Row }[] = [];

const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, cond]) => {
  if (key === "OR") return (cond as Row[]).some(w => matches(row, w));
  const value = row[key];
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    const c = cond as { in?: unknown[]; gt?: Date; gte?: Date };
    if (c.in && !c.in.includes(value)) return false;
    if (c.gt && !(value instanceof Date && value > c.gt)) return false;
    if (c.gte && !(value instanceof Date && value >= c.gte)) return false;
    return true;
  }
  return value === cond;
});
const sortBy = (rows: Row[], orderBy?: Row) => {
  const [key, dir] = orderBy ? (Object.entries(orderBy)[0] as [string, "asc" | "desc"]) : ["", "asc"];
  return key ? [...rows].sort((a, b) => ((a[key] as Date).getTime() - (b[key] as Date).getTime()) * (dir === "asc" ? 1 : -1)) : rows;
};
const shape = (name: string, row: Row, select?: Row) => {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map(k => [k, k === "class" && name === "student" ? tables.class.find(c => c.id === row.classId) ?? null : row[k]]));
};
const model = (name: string) => ({
  findMany: async (args: { where?: Row; orderBy?: Row; take?: number; select?: Row } = {}) => {
    log.push({ model: name, where: args.where ?? {} });
    return sortBy(tables[name].filter(r => matches(r, args.where)), args.orderBy).slice(0, args.take ?? Infinity).map(r => shape(name, r, args.select));
  },
  findFirst: async (args: { where?: Row; orderBy?: Row; select?: Row } = {}) => {
    log.push({ model: name, where: args.where ?? {} });
    const row = sortBy(tables[name].filter(r => matches(r, args.where)), args.orderBy)[0];
    return row ? shape(name, row, args.select) : null;
  },
});
const prisma = Object.fromEntries(["pickupCheck", "pickupAuthorization", "pickupRestriction", "student", "user"].map(n => [n, model(n)]));
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const campusOps = (u: User) => u.role === "SUPER_ADMIN" || u.role === "CAMPUS_ADMIN";
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError, canManageCampusOps: campusOps } });
mock.module(src("lib/parent/guardian-access.ts"), { namedExports: { guardianHasAccess: async () => null } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof prisma) => unknown) => fn(prisma) } });
mock.module(src("lib/locale/store.ts"), { namedExports: { getLocalePackage: async () => ({ timezone: "UTC" }) } });

const desk: User = { userId: "u-desk", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" };
const deskB: User = { userId: "u-desk-b", role: "RECEPTIONIST", schoolId: "school-b", campusId: "campus-b" };
const deskA2: User = { userId: "u-desk-a2", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a2" };
const teacher: User = { userId: "u-teacher", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };

function seed(count: number) {
  log.length = 0;
  const now = Date.now(), soon = new Date(now + 3_600_000);
  tables.class = [{ id: "c-6a", name: "Grade 6", section: "A" }, { id: "c-b", name: "Year 3", section: null }];
  tables.user = [{ id: "u-parent-0", schoolId: "school-a", fullName: "Synthetic Guardian 0" }, { id: "u-parent-1", schoolId: "school-a", fullName: "Synthetic Guardian 1" }, { id: "u-parent-b", schoolId: "school-b", fullName: "Other School Guardian" }];
  tables.student = []; tables.pickupAuthorization = []; tables.pickupCheck = []; tables.pickupRestriction = [];
  for (let i = 0; i < count; i++) {
    tables.student.push({ id: `s-${i}`, schoolId: "school-a", classId: "c-6a", fullName: `Synthetic Student ${i}`, rollNo: `R${i}` });
    tables.pickupAuthorization.push({ id: `pa-${i}`, schoolId: "school-a", campusId: "campus-a", issuedById: `u-parent-${i % 2}`, recipientName: `Recipient ${i}`, recipientRelation: "Aunt", idMethod: "PHOTO_ID", idLast4: "1234", validUntil: soon });
    tables.pickupCheck.push({ id: `chk-${i}`, schoolId: "school-a", campusId: "campus-a", authorizationId: i === 3 ? null : `pa-${i}`, studentId: `s-${i}`, gate: "Main gate", status: "OPEN", blockReason: null, exceptionStatus: null, createdAt: new Date(now - (i + 1) * 60_000) });
  }
  // An older lifted, an expired, an older active and a newer active restriction: only the newest active one shows.
  tables.pickupRestriction.push(
    { id: "r-lifted", schoolId: "school-a", studentId: "s-0", kind: "DO_NOT_RELEASE", instruction: "Lifted", liftedAt: new Date(now - 1000), endsAt: null, createdAt: new Date(now - 10_000) },
    { id: "r-expired", schoolId: "school-a", studentId: "s-1", kind: "CUSTODY_ORDER", instruction: "Expired", liftedAt: null, endsAt: new Date(now - 1000), createdAt: new Date(now - 9000) },
    { id: "r-old", schoolId: "school-a", studentId: "s-2", kind: "LEAD_APPROVAL", instruction: "Older", liftedAt: null, endsAt: null, createdAt: new Date(now - 8000) },
    { id: "r-new", schoolId: "school-a", studentId: "s-2", kind: "CUSTODY_ORDER", instruction: "Call the pickup lead", reason: "Court order", liftedAt: null, endsAt: soon, createdAt: new Date(now - 7000) },
  );
  // Another school's rows, and another campus of the same school: never in campus-a's queue.
  tables.student.push({ id: "s-b", schoolId: "school-b", classId: "c-b", fullName: "Other School Student", rollNo: "B1" });
  tables.pickupAuthorization.push({ id: "pa-b", schoolId: "school-b", campusId: "campus-b", issuedById: "u-parent-b", recipientName: "Other Recipient", recipientRelation: "Uncle", idMethod: "PHOTO_ID", idLast4: null, validUntil: soon });
  tables.pickupCheck.push({ id: "chk-b", schoolId: "school-b", campusId: "campus-b", authorizationId: "pa-b", studentId: "s-b", gate: "North", status: "OPEN", blockReason: null, exceptionStatus: null, createdAt: new Date(now - 30_000) });
  tables.pickupCheck.push({ id: "chk-a2", schoolId: "school-a", campusId: "campus-a2", authorizationId: null, studentId: "s-0", gate: "East", status: "OPEN", blockReason: null, exceptionStatus: null, createdAt: new Date(now - 30_000) });
}

test("the gate queue loads 50 checks in a fixed number of school-scoped queries", async () => {
  const { gateQueue } = await import("../../src/lib/pickup/service");
  seed(5);
  await gateQueue(desk as never);
  const small = log.length;
  seed(60);
  const queue = await gateQueue(desk as never);
  assert.equal(queue.checks.length, 50);
  assert.equal(log.length, small, "query count does not grow with the number of checks");
  assert.ok(log.length <= 5, `expected at most 5 queries, got ${log.length}`);
  for (const q of log) assert.equal(q.where.schoolId, "school-a", `${q.model} is school-scoped`);
});

test("queue rows keep the student, recipient, authorizer and newest active restriction", async () => {
  const { gateQueue } = await import("../../src/lib/pickup/service");
  seed(5);
  const { lead, checks } = await gateQueue(desk as never);
  assert.equal(lead, false);
  assert.deepEqual(checks.map(c => c.checkId), ["chk-0", "chk-1", "chk-2", "chk-3", "chk-4"]);
  const [c0, c1, c2, c3] = checks;
  assert.deepEqual(c0.student, { name: "Synthetic Student 0", className: "Grade 6 A", rollNo: "R0" });
  assert.deepEqual(c0.recipient, { name: "Recipient 0", relation: "Aunt", idMethod: "PHOTO_ID", idLast4: "1234", validUntil: tables.pickupAuthorization[0].validUntil, authorizedBy: "Synthetic Guardian 0" });
  assert.equal(c1.recipient?.authorizedBy, "Synthetic Guardian 1");
  assert.equal(c0.restriction, null, "a lifted restriction does not show");
  assert.equal(c1.restriction, null, "an expired restriction does not show");
  assert.deepEqual(c2.restriction, { kind: "CUSTODY_ORDER", instruction: "Call the pickup lead" }, "newest active restriction, never its reason");
  assert.equal(c3.recipient, null, "a check without an authorization has no recipient");
  assert.equal(c0.gate, "Main gate");
  assert.ok(c0.createdAt instanceof Date);
});

test("each school and campus sees only its own queue; other roles are refused", async () => {
  const { gateQueue } = await import("../../src/lib/pickup/service");
  seed(3);
  const other = await gateQueue(deskB as never);
  assert.deepEqual(other.checks.map(c => [c.checkId, c.student.name, c.recipient?.authorizedBy]), [["chk-b", "Other School Student", "Other School Guardian"]]);
  assert.ok(log.every(q => q.where.schoolId === "school-b"));
  assert.deepEqual((await gateQueue(deskA2 as never)).checks.map(c => c.checkId), ["chk-a2"]);
  await assert.rejects(gateQueue(teacher as never), (e: Error & { status?: number }) => e.status === 403);
});

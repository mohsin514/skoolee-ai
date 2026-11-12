import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";
import type { ChatPeer, ChatSettings } from "../../src/lib/chat/policy";

// SKAI-1836: group/class channel creation checks every member against the
// direct-message rule. The batch form must give exactly the same decisions as
// one canDirectMessage per member, with a query count that does not grow with
// the member count, and the batched student lookup must carry the school scope.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });

type StudentRow = { id: string; schoolId: string; classId: string; status: string; studentUserId: string | null; guardians: string[] };

/** Synthetic QA-01 style fixtures: school-a teaches class-a; school-b reuses the same class id. */
const SIZE = 120;
const students: StudentRow[] = [];
for (let i = 0; i < SIZE; i++) {
  students.push({ id: `a-${i}`, schoolId: "school-a", classId: i % 2 === 0 ? "class-a" : "class-other", status: "active", studentUserId: `pupil-${i}`, guardians: [`parent-${i}`] });
}
students.push({ id: "left", schoolId: "school-a", classId: "class-a", status: "left", studentUserId: "pupil-left", guardians: ["parent-left"] });
students.push({ id: "b-0", schoolId: "school-b", classId: "class-a", status: "active", studentUserId: "pupil-b", guardians: ["parent-b"] });

type GuardianFilter = { guardianUserId?: string | { in: string[] } };
type StudentWhere = { schoolId?: string; classId?: { in: string[] }; status?: string; studentUserId?: string | { in: string[] }; guardianRelationships?: { some: GuardianFilter } };

function guardianMatches(guardian: string, filter: GuardianFilter | undefined) {
  if (!filter?.guardianUserId) return true;
  return typeof filter.guardianUserId === "string" ? filter.guardianUserId === guardian : filter.guardianUserId.in.includes(guardian);
}

function makeDb(tenant: string) {
  const calls: { model: string; where: unknown }[] = [];
  const studentMatches = (row: StudentRow, where: StudentWhere) => {
    // The tenant guard scopes every query to the request's school.
    if (row.schoolId !== tenant) return false;
    if (where.schoolId && row.schoolId !== where.schoolId) return false;
    if (where.classId && !where.classId.in.includes(row.classId)) return false;
    if (where.status && row.status !== where.status) return false;
    if (typeof where.studentUserId === "string" && row.studentUserId !== where.studentUserId) return false;
    if (where.studentUserId && typeof where.studentUserId === "object" && !where.studentUserId.in.includes(row.studentUserId ?? "")) return false;
    if (where.guardianRelationships && !row.guardians.some((g) => guardianMatches(g, where.guardianRelationships?.some))) return false;
    return true;
  };
  const log = (model: string, where: unknown) => calls.push({ model, where });
  const db = {
    class: { findMany: async ({ where }: { where: { classTeacherId: string } }) => (log("class", where), where.classTeacherId === "teacher-a" ? [{ id: "class-a" }] : []) },
    subject: { findMany: async ({ where }: { where: unknown }) => (log("subject", where), []) },
    timetableSlot: { findMany: async ({ where }: { where: unknown }) => (log("timetableSlot", where), []) },
    teachingAssignment: { findMany: async ({ where }: { where: unknown }) => (log("teachingAssignment", where), []) },
    student: {
      findFirst: async ({ where }: { where: StudentWhere }) => (log("student.findFirst", where), students.find((s) => studentMatches(s, where)) ? { id: "x" } : null),
      findMany: async ({ where, select }: { where: StudentWhere; select: { guardianRelationships?: { where: GuardianFilter } } }) => {
        log("student.findMany", where);
        return students.filter((s) => studentMatches(s, where)).map((s) => ({
          studentUserId: s.studentUserId,
          guardianRelationships: s.guardians.filter((g) => guardianMatches(g, select.guardianRelationships?.where)).map((guardianUserId) => ({ guardianUserId })),
        }));
      },
    },
  };
  return { db: db as never, calls };
}

const settings: ChatSettings = { studentToStudent: false, parentToParent: false, studentToSupport: true, parentToSupport: false, attachmentsEnabled: true, quietHoursEnabled: false, quietHoursStart: "20:00", quietHoursEnd: "07:00" };
const actor = (userId: string, role: AuthUser["role"], schoolId = "school-a", campusId = "campus-a"): AuthUser =>
  ({ userId, schoolId, campusId, role, email: "synthetic@example.invalid", accessVersion: 1 }) as AuthUser;
const peer = (id: string, role: ChatPeer["role"], campusId: string | null = "campus-a", isActive = true): ChatPeer => ({ id, role, campusId, isActive });

const peers: ChatPeer[] = [
  ...Array.from({ length: SIZE }, (_, i) => peer(`parent-${i}`, "PARENT")),
  ...Array.from({ length: SIZE }, (_, i) => peer(`pupil-${i}`, "STUDENT")),
  peer("parent-left", "PARENT"),
  peer("pupil-left", "STUDENT"),
  peer("parent-b", "PARENT"),
  peer("pupil-b", "STUDENT"),
  peer("parent-inactive", "PARENT", "campus-a", false),
  peer("teacher-b", "TEACHER"),
  peer("teacher-campus-b", "TEACHER", "campus-b"),
  peer("accountant-1", "ACCOUNTANT"),
  peer("principal-1", "PRINCIPAL"),
  peer("owner-1", "APP_OWNER"),
];

async function compare(user: AuthUser, tenant: string, targets: ChatPeer[]) {
  const { canDirectMessage, canDirectMessageMany } = await import("../../src/lib/chat/policy");
  const single = makeDb(tenant);
  const expected = [];
  for (const target of targets) expected.push(await canDirectMessage(user, target, settings, single.db));
  const batch = makeDb(tenant);
  const actual = await canDirectMessageMany(user, targets, settings, batch.db);
  assert.deepEqual(actual, expected);
  return { decisions: actual, single: single.calls, batch: batch.calls };
}

test("a teacher's batch gives the same decisions and reasons as one check per member, in bounded queries", async () => {
  const { decisions, single, batch } = await compare(actor("teacher-a", "TEACHER"), "school-a", peers);
  const allowed = new Set(peers.filter((_, i) => decisions[i].allowed).map((p) => p.id));
  assert.ok(allowed.has("parent-0") && allowed.has("pupil-0"));
  assert.ok(!allowed.has("parent-1") && !allowed.has("pupil-1"), "families of another class stay out of reach");
  assert.ok(!allowed.has("parent-left") && !allowed.has("pupil-left"), "inactive enrolment does not grant contact");
  assert.ok(!allowed.has("parent-b") && !allowed.has("pupil-b"), "a second school's child with the same class id does not grant contact");
  assert.equal(decisions[peers.findIndex((p) => p.id === "parent-1")].reason, "You can only message the families of students you teach");
  assert.ok(single.length > 4 * SIZE, "the per-member path grows with the class");
  assert.ok(batch.length <= 6, `batch ran ${batch.length} queries`);
});

test("the batched student lookups carry the actor's school", async () => {
  const { batch } = await compare(actor("teacher-a", "TEACHER"), "school-a", peers);
  const lookups = batch.filter((c) => c.model === "student.findMany");
  assert.equal(lookups.length, 2);
  for (const call of lookups) assert.equal((call.where as StudentWhere).schoolId, "school-a");
});

test("a teacher in the second school reaches only that school's family", async () => {
  const user = actor("teacher-a", "TEACHER", "school-b");
  const { decisions } = await compare(user, "school-b", [peer("parent-b", "PARENT"), peer("parent-0", "PARENT")]);
  assert.deepEqual(decisions.map((d) => d.allowed), [true, false]);
});

test("leadership and support creators need no relationship queries and keep their campus and settings rules", async () => {
  const principal = await compare(actor("principal-a", "PRINCIPAL"), "school-a", peers);
  assert.equal(principal.batch.length, 0);
  assert.equal(principal.decisions[peers.findIndex((p) => p.id === "teacher-campus-b")].reason, "That person belongs to a different campus");

  const accountant = await compare(actor("accountant-a", "ACCOUNTANT"), "school-a", peers);
  assert.equal(accountant.batch.length, 0);
  assert.equal(accountant.decisions[0].reason, "Your school has not enabled messaging with this department");
  assert.equal(accountant.decisions[SIZE].allowed, true);
});

test("a family actor (denied role for groups) still gets the per-peer rule for teachers", async () => {
  const { decisions } = await compare(actor("parent-0", "PARENT"), "school-a", [peer("teacher-a", "TEACHER"), peer("teacher-b", "TEACHER"), peer("parent-1", "PARENT")]);
  assert.deepEqual(decisions.map((d) => d.allowed), [true, false, false]);
  assert.equal(decisions[1].reason, "You can only message your own child's teachers");
});

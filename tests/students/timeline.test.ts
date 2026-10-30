import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-166: student timeline — newest-first keyset pages with stable event ids, actor names for staff,
// school/campus/guardian scope with one 404 for "not yours", and families told how much is withheld.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

type Event = { id: string; studentId: string; kind: string; title: string; detail: string | null; actorId: string | null; createdAt: Date };
const h = {
  students: [] as { id: string; schoolId: string; campusId: string; guardians: string[] }[],
  events: [] as Event[],
  users: [] as { id: string; schoolId: string; fullName: string }[],
  denied: new Set<string>(),
};
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Where = Record<string, unknown>;
const kindOk = (kind: string, w: unknown) => {
  if (!w) return true;
  const f = w as { in?: string[]; notIn?: string[]; equals?: string };
  if (f.in) return f.in.includes(kind);
  if (f.notIn) return !f.notIn.includes(kind);
  return f.equals === undefined || f.equals === kind;
};
const eventMatches = (e: Event, where: Where): boolean => {
  if (where.studentId && e.studentId !== where.studentId) return false;
  if (!kindOk(e.kind, where.kind)) return false;
  if (where.OR) return (where.OR as Where[]).some(branch => {
    const c = branch.createdAt as { lt?: Date } | Date;
    if (c instanceof Date) return e.createdAt.getTime() === c.getTime() && e.id < (branch.id as { lt: string }).lt;
    return e.createdAt < c.lt!;
  });
  return true;
};
const prisma = {
  student: { findFirst: async ({ where }: { where: Where }) => {
    const s = h.students.find(x => x.id === where.id && x.schoolId === where.schoolId && (!where.campusId || x.campusId === where.campusId) && (!where.guardianUserId || x.guardians.includes(where.guardianUserId as string)));
    return s ? { id: s.id, campusId: s.campusId } : null;
  } },
  studentTimelineEvent: {
    findMany: async ({ where, take }: { where: Where; take: number }) => h.events.filter(e => eventMatches(e, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)).slice(0, take),
    count: async ({ where }: { where: Where }) => h.events.filter(e => eventMatches(e, where)).length,
  },
  user: { findMany: async ({ where }: { where: { id: { in: string[] }; schoolId: string } }) => h.users.filter(u => where.id.in.includes(u.id) && u.schoolId === where.schoolId) },
};
type U = { userId: string; role: string; schoolId: string; campusId: string | null };
const family = (u: U) => u.role === "PARENT" || u.role === "STUDENT";
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError, assertPermission: async (u: U, module: string, action: string) => { if (h.denied.has(`${u.role}:${module}.${action}`)) throw new ApiError(`Insufficient permissions: ${module}.${action}`, 403); } } });
mock.module(src("lib/auth/policy.ts"), { namedExports: {
  isFamily: family,
  studentScope: (u: U) => u.role === "PARENT" ? { schoolId: u.schoolId, guardianUserId: u.userId } : { schoolId: u.schoolId, ...(u.role === "SUPER_ADMIN" ? {} : { campusId: u.campusId }) },
} });

const svc = () => import("../../src/lib/students/timeline");
const user = (role: string, schoolId = "school-a", campusId: string | null = "campus-a", userId = "u-admin") => ({ userId, role, schoolId, campusId }) as never;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 8, minute));

beforeEach(() => {
  h.denied = new Set(["LIBRARIAN:students.view", "TEACHER:students.edit"]);
  h.students = [
    { id: "stu-1", schoolId: "school-a", campusId: "campus-a", guardians: ["parent-1"] },
    { id: "stu-2", schoolId: "school-a", campusId: "campus-b", guardians: [] },
    { id: "stu-9", schoolId: "school-b", campusId: "campus-z", guardians: [] },
  ];
  h.users = [{ id: "u-admin", schoolId: "school-a", fullName: "Registrar Rana" }, { id: "u-other", schoolId: "school-b", fullName: "Elsewhere" }];
  h.events = [
    { id: "e1", studentId: "stu-1", kind: "ADMITTED", title: "Admitted to Grade 1", detail: null, actorId: "u-admin", createdAt: at(1) },
    { id: "e2", studentId: "stu-1", kind: "NOTE", title: "Allergy noted", detail: "Peanuts", actorId: "u-admin", createdAt: at(2) },
    { id: "e3", studentId: "stu-1", kind: "ENROLLMENT_TRANSITION", title: "Moved to 1-B", detail: "Section balance", actorId: "u-other", createdAt: at(3) },
    { id: "e4", studentId: "stu-1", kind: "PROMOTED", title: "Promoted", detail: null, actorId: null, createdAt: at(3) },
    { id: "e9", studentId: "stu-9", kind: "NOTE", title: "Other school", detail: null, actorId: "u-other", createdAt: at(5) },
  ];
});

test("orders newest first with id tie-break and pages without repeats or gaps", async () => {
  const { readStudentTimeline } = await svc();
  const first = await readStudentTimeline(user("SUPER_ADMIN"), "stu-1", { limit: 2 });
  assert.deepEqual(first.events.map(e => e.id), ["e4", "e3"]);
  assert.ok(first.nextCursor);
  const second = await readStudentTimeline(user("SUPER_ADMIN"), "stu-1", { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.events.map(e => e.id), ["e2", "e1"]);
  assert.equal(second.nextCursor, null);
  // An event appended between pages does not shift the next page.
  h.events.push({ id: "e5", studentId: "stu-1", kind: "NOTE", title: "New", detail: null, actorId: null, createdAt: at(9) });
  const again = await readStudentTimeline(user("SUPER_ADMIN"), "stu-1", { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(again.events.map(e => e.id), ["e2", "e1"]);
});

test("staff see actor names from their own school only, detail and the add-note permission", async () => {
  const { readStudentTimeline } = await svc();
  const page = await readStudentTimeline(user("ADMIN"), "stu-1");
  assert.equal(page.events.find(e => e.id === "e2")?.actor?.name, "Registrar Rana");
  assert.equal(page.events.find(e => e.id === "e2")?.detail, "Peanuts");
  assert.equal(page.events.find(e => e.id === "e3")?.actor, null, "a user id from another school never resolves to a name");
  assert.equal(page.restrictedCount, 0);
  assert.equal(page.canAddNote, true);
  assert.equal((await readStudentTimeline(user("TEACHER"), "stu-1")).canAddNote, false);
});

test("another tenant or another campus is the same 404; a role without students.view is 403", async () => {
  const { readStudentTimeline } = await svc();
  await assert.rejects(readStudentTimeline(user("ADMIN"), "stu-9"), { status: 404 });
  await assert.rejects(readStudentTimeline(user("ADMIN", "school-b", "campus-z"), "stu-1"), { status: 404 });
  await assert.rejects(readStudentTimeline(user("ADMIN"), "stu-2"), { status: 404 });
  await assert.rejects(readStudentTimeline(user("LIBRARIAN"), "stu-1"), { status: 403 });
  await assert.rejects(readStudentTimeline(user("ADMIN"), ""), { status: 400 });
});

test("guardians see milestones only, no detail or staff names, and how many entries are withheld", async () => {
  const { readStudentTimeline } = await svc();
  const page = await readStudentTimeline(user("PARENT", "school-a", null, "parent-1"), "stu-1");
  assert.deepEqual(page.events.map(e => e.kind), ["PROMOTED", "ENROLLMENT_TRANSITION", "ADMITTED"]);
  assert.ok(page.events.every(e => e.detail === null && e.actor === null));
  assert.equal(page.restrictedCount, 1);
  assert.equal(page.canAddNote, false);
  const notes = await readStudentTimeline(user("PARENT", "school-a", null, "parent-1"), "stu-1", { kind: "note" });
  assert.equal(notes.events.length, 0, "asking for a staff-only kind returns nothing rather than leaking it");
  await assert.rejects(readStudentTimeline(user("PARENT", "school-a", null, "parent-2"), "stu-1"), { status: 404 });
});

test("rejects a malformed cursor or kind and clamps the page size", async () => {
  const { readStudentTimeline } = await svc();
  await assert.rejects(readStudentTimeline(user("ADMIN"), "stu-1", { cursor: "bm9wZQ" }), { status: 400 });
  await assert.rejects(readStudentTimeline(user("ADMIN"), "stu-1", { kind: "x;drop" }), { status: 400 });
  const page = await readStudentTimeline(user("ADMIN"), "stu-1", { limit: 999 });
  assert.equal(page.events.length, 4);
});

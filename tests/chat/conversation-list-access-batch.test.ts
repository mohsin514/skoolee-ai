import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1837: the inbox re-checked access with several queries per conversation. The batched check must hide
// and show exactly the same threads as the per-row check, with a query count that does not grow with the list.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {}, tenantTransaction: async () => undefined } });

type Role = AuthUser["role"];
const users = [
  { id: "teacher-a", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" },
  { id: "teacher-c", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" },
  { id: "parent-a", role: "PARENT", schoolId: "school-a", campusId: "campus-a" },
  { id: "parent-b", role: "PARENT", schoolId: "school-a", campusId: "campus-a" },
  { id: "parent-gone", role: "PARENT", schoolId: "school-a", campusId: "campus-a" },
  { id: "student-s1", role: "STUDENT", schoolId: "school-a", campusId: "campus-a" },
  { id: "student-s2", role: "STUDENT", schoolId: "school-a", campusId: "campus-a" },
  { id: "parent-x", role: "PARENT", schoolId: "school-b", campusId: "campus-x" },
  { id: "teacher-x", role: "TEACHER", schoolId: "school-b", campusId: "campus-x" },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `parent-many-${i}`, role: "PARENT", schoolId: "school-a", campusId: "campus-a" })),
].map((user) => ({ ...user, isActive: true, fullName: "Synthetic Person", profileImageUrl: null }));
const classes = [{ id: "class-a", classTeacherId: "teacher-a" }, { id: "class-b", classTeacherId: "teacher-c" }, { id: "class-x", classTeacherId: "teacher-x" }];
const students = [
  { id: "child-a", schoolId: "school-a", classId: "class-a", studentUserId: "student-s1", status: "active" },
  { id: "child-b", schoolId: "school-a", classId: "class-b", studentUserId: null, status: "active" },
  { id: "child-x", schoolId: "school-b", classId: "class-x", studentUserId: null, status: "active" },
];
const links = [
  { guardianUserId: "parent-a", studentId: "child-a", live: true },
  { guardianUserId: "parent-gone", studentId: "child-a", live: false },
  { guardianUserId: "parent-b", studentId: "child-b", live: true },
  { guardianUserId: "parent-x", studentId: "child-x", live: true },
  ...Array.from({ length: 12 }, (_, i) => ({ guardianUserId: `parent-many-${i}`, studentId: i % 2 ? "child-a" : "child-b", live: true })),
];

const conversations = [
  { id: "d-teacher-parent", kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["teacher-a", "parent-a"] },
  { id: "d-lapsed-parent", kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["teacher-a", "parent-b"] },
  { id: "d-guardian-pupil", kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["parent-a", "student-s1"] },
  { id: "d-pupil-pupil", kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["student-s1", "student-s2"] },
  { id: "d-cross-school-peer", kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["teacher-a", "parent-x"] },
  { id: "c-class-a", kind: "CLASS", schoolId: "school-a", campusId: "campus-a", classId: "class-a", memberIds: ["teacher-a", "parent-a", "parent-gone", "student-s1"] },
  { id: "g-other-campus", kind: "GROUP", schoolId: "school-a", campusId: "campus-b", classId: null, memberIds: ["teacher-a", "teacher-c"] },
  { id: "c-school-b", kind: "CLASS", schoolId: "school-b", campusId: "campus-x", classId: "class-x", memberIds: ["teacher-x", "parent-x", "teacher-a"] },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `d-many-${i}`, kind: "DIRECT", schoolId: "school-a", campusId: "campus-a", classId: null, memberIds: ["teacher-a", `parent-many-${i}`] })),
];

/** Every value of `key` anywhere in a Prisma where (string or { in }), so nested predicates can be read without a full evaluator. */
function collect(where: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(where)) where.forEach((item) => collect(item, key, out));
  else if (where && typeof where === "object") for (const [k, v] of Object.entries(where)) {
    if (k === key && typeof v === "string") out.push(v);
    else if (k === key && v && typeof v === "object" && Array.isArray((v as { in?: unknown }).in)) out.push(...(v as { in: string[] }).in);
    else collect(v, key, out);
  }
  return out;
}
const live = (guardianIds: string[], studentId: string) => links.filter((l) => l.live && l.studentId === studentId && guardianIds.includes(l.guardianUserId));
const userById = new Map(users.map((u) => [u.id, u]));

let calls = 0;
const tick = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => { calls += 1; return fn(...args); };
type W = { where: Record<string, unknown> };
const db = {
  user: {
    findFirst: tick(async ({ where }: W) => users.find((u) => u.id === where.id && u.schoolId === where.schoolId) ?? null),
    findMany: tick(async ({ where }: W) => users.filter((u) => collect({ id: where.id }, "id").includes(u.id) && u.schoolId === where.schoolId)),
  },
  chatSetting: { findUnique: tick(async () => null) },
  class: { findMany: tick(async ({ where }: W) => classes.filter((c) => collect(where, "classTeacherId").includes(c.classTeacherId))) },
  subject: { findMany: tick(async () => []) },
  timetableSlot: { findMany: tick(async () => []) },
  teachingAssignment: { findMany: tick(async () => []) },
  conversationMember: {
    findMany: tick(async ({ where }: W) => conversations.filter((c) => collect(where, "conversationId").includes(c.id) && c.schoolId === where.schoolId)
      .flatMap((c) => c.memberIds.filter((id) => userById.get(id)?.role === "PARENT").map((userId) => ({ conversationId: c.id, userId })))),
  },
  guardianRelationship: {
    findMany: tick(async ({ where }: W) => {
      const schools = collect(where, "schoolId"), guardians = collect(where, "guardianUserId"), classIds = collect(where, "classId");
      return students.filter((s) => schools.includes(s.schoolId) && classIds.includes(s.classId))
        .flatMap((s) => live(guardians, s.id).map((l) => ({ guardianUserId: l.guardianUserId, student: { classId: s.classId } })));
    }),
  },
  student: {
    // Per-row path: teacherSharesStudent (classId in) or sharesStudentRecord (studentUserId).
    findFirst: tick(async ({ where }: W) => students.find((s) => {
      if (where.classId) {
        if (!collect({ classId: where.classId }, "classId").includes(s.classId) || s.status !== where.status) return false;
        return where.guardianRelationships ? live(collect(where.guardianRelationships, "guardianUserId"), s.id).length > 0 : s.studentUserId === where.studentUserId;
      }
      return s.studentUserId === where.studentUserId && live(collect(where.guardianRelationships, "guardianUserId"), s.id).length > 0;
    }) ?? null),
    // Batched path: one query for every teacher pair, one for every guardian/pupil pair.
    findMany: tick(async ({ where }: W) => students.filter((s) => s.schoolId === where.schoolId).flatMap((s) => {
      const or = where.OR as Array<Record<string, unknown>> | undefined;
      const guardians = collect(or ? or[0] : where.guardianRelationships, "guardianUserId");
      const linked = live(guardians, s.id).map((l) => ({ guardianUserId: l.guardianUserId }));
      if (or) {
        const ok = collect({ classId: where.classId }, "classId").includes(s.classId) && s.status === where.status
          && (linked.length > 0 || collect(or[1], "studentUserId").includes(s.studentUserId ?? ""));
        return ok ? [{ classId: s.classId, studentUserId: s.studentUserId, guardianRelationships: linked }] : [];
      }
      return collect({ id: where.studentUserId }, "id").includes(s.studentUserId ?? "") && linked.length ? [{ studentUserId: s.studentUserId, guardianRelationships: linked }] : [];
    })),
  },
};

const member = (userId: string) => ({ userId, memberRole: "MEMBER", unreadCount: 0, lastReadAt: null, isMuted: false, isPinned: false, isArchived: false, user: (({ id, fullName, role, profileImageUrl }) => ({ id, fullName, role, profileImageUrl }))(userById.get(userId)!) });
const fullRow = (c: (typeof conversations)[number]) => ({ ...c, members: c.memberIds.map(member) }) as never;
// What conversationListInclude(viewerId) loads: the viewer's own row (or both rows of a DIRECT thread) plus a count.
const listRow = (c: (typeof conversations)[number], viewerId: string) => ({ ...c, members: c.memberIds.filter((id) => c.kind === "DIRECT" || id === viewerId).map(member), _count: { members: c.memberIds.length } }) as never;
const viewer = (userId: string): AuthUser => { const u = userById.get(userId)!; return { userId, schoolId: u.schoolId, campusId: u.campusId, role: u.role as Role, email: "synthetic@example.invalid", accessVersion: 1 }; };
const mine = (userId: string) => conversations.filter((c) => c.memberIds.includes(userId));

async function legacy(user: AuthUser) {
  const { assertCurrentConversationAccess } = await import("../../src/lib/chat/membership");
  const out: Array<{ id: string; memberCount: number }> = [];
  for (const c of mine(user.userId)) {
    try { const { row } = await assertCurrentConversationAccess(user, fullRow(c), db as never); out.push({ id: c.id, memberCount: (row as { members: unknown[] }).members.length }); } catch { /* hidden */ }
  }
  return out;
}
async function batched(user: AuthUser, rows = mine(user.userId)) {
  const { accessibleConversationList } = await import("../../src/lib/chat/membership");
  calls = 0;
  const out = (await accessibleConversationList(user, rows.map((c) => listRow(c, user.userId)), db as never)).map(({ row, memberCount }) => ({ id: row.id, memberCount }));
  return { out, queries: calls };
}

test("the batched check shows the same threads and member counts as the per-row check, for every role", async () => {
  for (const id of ["teacher-a", "teacher-c", "parent-a", "parent-b", "parent-gone", "student-s1", "student-s2", "parent-x", "teacher-x", "parent-many-3"]) {
    const user = viewer(id);
    assert.deepEqual((await batched(user)).out, await legacy(user), `viewer ${id}`);
  }
});

test("tenant, campus, lapsed-policy and removed-guardian threads stay hidden", async () => {
  const teacher = (await batched(viewer("teacher-a"))).out;
  const ids = teacher.map((row) => row.id);
  assert.ok(ids.includes("d-teacher-parent"));
  for (const hidden of ["d-lapsed-parent", "d-cross-school-peer", "g-other-campus", "c-school-b"]) assert.ok(!ids.includes(hidden), hidden);
  // parent-gone's guardianship has lapsed: not counted, and the thread is gone from their own inbox.
  assert.equal(teacher.find((row) => row.id === "c-class-a")?.memberCount, 3);
  assert.deepEqual((await batched(viewer("parent-gone"))).out, []);
  // Denied role: pupil-to-pupil stays closed while the school leaves it off.
  assert.deepEqual((await batched(viewer("student-s1"))).out.map((row) => row.id), ["d-guardian-pupil", "c-class-a"]);
  // School B's teacher never sees school A's threads, and school A's teacher never sees school B's.
  assert.deepEqual((await batched(viewer("teacher-x"))).out.map((row) => row.id), ["c-school-b"]);
});

test("the query count does not grow with the number of threads", async () => {
  const all = mine("teacher-a");
  const small = await batched(viewer("teacher-a"), all.slice(0, 2).concat(all.filter((c) => c.kind === "CLASS")));
  const large = await batched(viewer("teacher-a"), all);
  assert.ok(large.out.length > small.out.length + 5);
  assert.equal(large.queries, small.queries);
  assert.ok(large.queries <= 10, `queries ${large.queries}`);
});

import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1839: the notification list reads each source type once per page, not once per row, and the batched chat
// check reaches exactly the same decision as requireMembership (campus, membership, class guardian link, DIRECT policy).
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });

type Person = { id: string; schoolId: string; campusId: string | null; role: string; isActive: boolean };
const people: Person[] = [
  { id: "ca1", schoolId: "s1", campusId: "c1", role: "CAMPUS_ADMIN", isActive: true },
  { id: "ca2", schoolId: "s1", campusId: "c2", role: "CAMPUS_ADMIN", isActive: true },
  { id: "te1", schoolId: "s1", campusId: "c1", role: "TEACHER", isActive: true },
  { id: "pa1", schoolId: "s1", campusId: null, role: "PARENT", isActive: true },
  { id: "pa2", schoolId: "s1", campusId: null, role: "PARENT", isActive: true },
  { id: "gone", schoolId: "s1", campusId: "c1", role: "TEACHER", isActive: false },
  { id: "x2", schoolId: "s2", campusId: "k1", role: "CAMPUS_ADMIN", isActive: true },
  ...Array.from({ length: 40 }, (_, i) => ({ id: `kid${i}`, schoolId: "s1", campusId: "c1", role: "STUDENT", isActive: true })),
];
type Member = { userId: string; leftAt: Date | null };
type Conversation = { id: string; kind: string; schoolId: string; campusId: string | null; classId: string | null; members: Member[] };
const join_ = (...ids: string[]): Member[] => ids.map((userId) => ({ userId, leftAt: null }));
const conversations: Conversation[] = [
  { id: "class-a", kind: "CLASS", schoolId: "s1", campusId: "c1", classId: "A", members: join_("te1", "pa1", ...people.filter((p) => p.id.startsWith("kid")).map((p) => p.id)) },
  { id: "class-b", kind: "CLASS", schoolId: "s1", campusId: "c1", classId: "B", members: join_("te1", "pa1") }, // pa1 has no live link to B
  { id: "staff-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "ca1") },
  { id: "family-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "pa2") }, // teaches none of pa2's children
  { id: "inactive-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "gone") },
  { id: "campus-2", kind: "GROUP", schoolId: "s1", campusId: "c2", classId: null, members: join_("te1", "ca1", "ca2", "pa1") },
  { id: "left", kind: "GROUP", schoolId: "s1", campusId: "c1", classId: null, members: [{ userId: "te1", leftAt: new Date() }, ...join_("ca1")] },
  { id: "other-school", kind: "GROUP", schoolId: "s2", campusId: "k1", classId: null, members: join_("x2", "te1", "pa1", "ca1") },
];
const guardianLinks = [{ guardianUserId: "pa1", classId: "A" }];

type Where = Record<string, unknown> & { id?: string | { in: string[] }; schoolId?: string; campusId?: string };
const idMatch = (id: string, where: Where) => (typeof where.id === "string" ? where.id === id : !where.id || where.id.in.includes(id));
const scoped = (row: { id: string; schoolId: string; campusId?: string | null }, where: Where) => idMatch(row.id, where) && (!where.schoolId || row.schoolId === where.schoolId) && (!where.campusId || row.campusId === where.campusId);
const person = (id: string) => people.find((p) => p.id === id)!;

function fakeDb() {
  const calls: Record<string, number> = {};
  let memberRows = 0;
  const count = (name: string) => { calls[name] = (calls[name] ?? 0) + 1; };
  const members = (row: Conversation, onlyFor?: string) => row.members
    .filter((m) => m.leftAt === null && person(m.userId).isActive && (!onlyFor || m.userId === onlyFor || row.kind === "DIRECT"))
    .map((m) => { memberRows += 1; const p = person(m.userId); return { userId: m.userId, memberRole: "MEMBER", user: { id: p.id, fullName: p.id, role: p.role, profileImageUrl: null } }; });
  const records = (name: string, rows: Array<Record<string, unknown> & { id: string; schoolId: string }>) => ({
    findMany: async ({ where }: { where: Where }) => { count(name); return rows.filter((row) => scoped(row, where)); },
  });
  const db = {
    conversation: {
      findFirst: async ({ where }: { where: Where }) => { count("conversation"); const row = conversations.find((c) => scoped(c, where)); return row ? { ...row, members: members(row) } : null; },
      findMany: async ({ where, select }: { where: Where; select: { members: { where: { OR: Array<{ userId?: string }> } } } }) => {
        count("conversation");
        return conversations.filter((c) => scoped(c, where)).map((row) => ({ ...row, members: members(row, select.members.where.OR[0]!.userId) }));
      },
    },
    guardianRelationship: {
      findMany: async ({ where }: { where: { AND: [unknown, { guardianUserId: string | { in: string[] }; student: { classId: string | { in: string[] } } }] } }) => {
        count("guardianRelationship");
        const { guardianUserId: g, student: { classId: c } } = where.AND[1];
        return guardianLinks
          .filter((l) => (typeof g === "string" ? l.guardianUserId === g : g.in.includes(l.guardianUserId)) && (typeof c === "string" ? l.classId === c : c.in.includes(l.classId)))
          .map((l) => ({ guardianUserId: l.guardianUserId, student: { classId: l.classId } }));
      },
    },
    user: {
      findFirst: async ({ where }: { where: Where & { isActive: boolean } }) => { count("user"); return people.find((p) => scoped(p, where) && p.isActive) ?? null; },
      findMany: async ({ where }: { where: Where & { isActive: boolean } }) => { count("user"); return people.filter((p) => scoped(p, where) && p.isActive); },
    },
    chatSetting: { findUnique: async () => { count("chatSetting"); return null; } },
    class: { findMany: async () => [] },
    subject: { findMany: async () => [] },
    timetableSlot: { findMany: async () => [] },
    teachingAssignment: { findMany: async () => [] },
    student: { findFirst: async () => null },
    rolePermission: { findMany: async () => { count("rolePermission"); return []; } },
    leaveRequest: records("leaveRequest", [
      { id: "leave-c1", schoolId: "s1", campusId: "c1", status: "PENDING" },
      { id: "leave-c1-done", schoolId: "s1", campusId: "c1", status: "APPROVED" },
      { id: "leave-c2", schoolId: "s1", campusId: "c2", status: "PENDING" },
      { id: "leave-s2", schoolId: "s2", campusId: "c1", status: "PENDING" },
    ]),
    phoneCallback: records("phoneCallback", [{ id: "cb-1", schoolId: "s1", campusId: "c1", status: "OPEN", ownerId: "ca1" }]),
  };
  return { db, calls, memberRows: () => memberRows };
}

const user = (id: string): AuthUser => { const p = person(id); return { userId: p.id, schoolId: p.schoolId, campusId: p.campusId, role: p.role } as AuthUser; };
const allIds = conversations.map((c) => c.id);

test("batched chat access matches requireMembership for every reader and conversation", async () => {
  const { accessibleConversationIds, requireMembership } = await import(src("lib/chat/membership.ts"));
  for (const reader of ["te1", "pa1", "ca1", "ca2", "x2"]) {
    const expected = new Set<string>();
    for (const id of allIds) {
      const { db } = fakeDb();
      if (await requireMembership(user(reader), id, db).then(() => true, () => false)) expected.add(id);
    }
    const { db } = fakeDb();
    assert.deepEqual([...await accessibleConversationIds(user(reader), allIds, db)].sort(), [...expected].sort(), reader);
  }
  const { db } = fakeDb();
  assert.deepEqual([...await accessibleConversationIds(user("te1"), allIds, db)].sort(), ["class-a", "class-b", "staff-dm"], "teacher: own campus, live peers only");
  assert.deepEqual([...await accessibleConversationIds(user("pa1"), allIds, db)].sort(), ["campus-2", "class-a"], "parent: linked class only, never school 2");
});

test("a page of chat rows reads conversations once, without loading class rosters", async () => {
  const { sourceLookup, sourceView } = await import(src("lib/notifications/actions.ts"));
  const { db, calls, memberRows } = fakeDb();
  const rows = Array.from({ length: 30 }, (_, i) => ({ type: "CHAT_MESSAGE", sourceType: "chat", sourceId: allIds[i % allIds.length], link: null, category: "MESSAGE", resolvedAt: null, resolution: null }));
  const lookup = sourceLookup(user("te1"), rows, db, { batchChat: true });
  const views = await Promise.all(rows.map((row) => sourceView(user("te1"), row, db, lookup)));
  assert.equal(calls.conversation, 1, "one conversation query for the whole page");
  assert.ok((calls.user ?? 0) <= 1 && (calls.chatSetting ?? 0) <= 1, JSON.stringify(calls));
  assert.ok(memberRows() < 20, `only the reader's membership and DIRECT peers are read (${memberRows()} rows)`);
  assert.deepEqual(views.filter((v: { state: string }) => v.state !== "unavailable").length, rows.filter((r) => ["class-a", "class-b", "staff-dm"].includes(r.sourceId)).length);
});

test("leave rows read the requests and the reviewer grant once, keeping school, campus and role scope", async () => {
  const { sourceLookup, sourceView } = await import(src("lib/notifications/actions.ts"));
  const ids = ["leave-c1", "leave-c1-done", "leave-c2", "leave-s2"];
  const rows = Array.from({ length: 24 }, (_, i) => ({ type: "LEAVE_APPLIED", sourceType: "leave", sourceId: ids[i % ids.length]!, link: null, category: "ACTION", resolvedAt: null, resolution: null }));
  const states = async (reader: string) => {
    const { db, calls } = fakeDb();
    const lookup = sourceLookup(user(reader), rows, db, { batchChat: true });
    const views = await Promise.all(rows.map((row) => sourceView(user(reader), row, db, lookup)));
    return { calls, byId: Object.fromEntries(rows.map((row, i) => [row.sourceId, views[i].state])) };
  };
  const admin = await states("ca1");
  assert.deepEqual(admin.byId, { "leave-c1": "open", "leave-c1-done": "resolved", "leave-c2": "unavailable", "leave-s2": "unavailable" });
  assert.equal(admin.calls.leaveRequest, 1);
  assert.equal(admin.calls.rolePermission, 1);
  const otherCampus = await states("ca2");
  assert.deepEqual(otherCampus.byId, { "leave-c1": "unavailable", "leave-c1-done": "unavailable", "leave-c2": "open", "leave-s2": "unavailable" });
  const teacher = await states("te1");
  assert.ok(Object.values(teacher.byId).every((state) => state === "unavailable"), "a teacher never reviews leave");
  assert.equal(teacher.calls.rolePermission ?? 0, 0);
  const otherSchool = await states("x2");
  assert.ok(Object.values(otherSchool.byId).every((state) => state === "unavailable"), "school 2 never sees school 1's requests");
});

test("the open route's single-row view still uses requireMembership and one scoped read", async () => {
  const { sourceView } = await import(src("lib/notifications/actions.ts"));
  const { db, calls } = fakeDb();
  const view = await sourceView(user("ca1"), { type: "PHONE_CALLBACK_ASSIGNED", sourceType: "callback", sourceId: "cb-1", link: null, category: "ACTION", resolvedAt: null, resolution: null }, db);
  assert.equal(view.state, "open");
  assert.equal(calls.phoneCallback, 1);
  const chat = await sourceView(user("pa1"), { type: "CHAT_MESSAGE", sourceType: "chat", sourceId: "class-b", link: null, category: "MESSAGE", resolvedAt: null, resolution: null }, db);
  assert.equal(chat.state, "unavailable", "an unlinked parent is denied on open");
});

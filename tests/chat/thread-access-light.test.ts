import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1879: thread calls (message pages, read receipts, attachments) check access without loading the channel roster,
// and reach exactly requireMembership's decision for every reader: two schools, two campuses and denied roles.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });

type Person = { id: string; schoolId: string; campusId: string | null; role: string; isActive: boolean };
const kids = Array.from({ length: 60 }, (_, i) => ({ id: `kid${i}`, schoolId: "s1", campusId: "c1", role: "STUDENT", isActive: true }));
const people: Person[] = [
  { id: "ca1", schoolId: "s1", campusId: "c1", role: "CAMPUS_ADMIN", isActive: true },
  { id: "ca2", schoolId: "s1", campusId: "c2", role: "CAMPUS_ADMIN", isActive: true },
  { id: "te1", schoolId: "s1", campusId: "c1", role: "TEACHER", isActive: true },
  { id: "pa1", schoolId: "s1", campusId: null, role: "PARENT", isActive: true },
  { id: "pa2", schoolId: "s1", campusId: null, role: "PARENT", isActive: true },
  { id: "gone", schoolId: "s1", campusId: "c1", role: "TEACHER", isActive: false },
  { id: "x2", schoolId: "s2", campusId: "k1", role: "CAMPUS_ADMIN", isActive: true },
  { id: "owner", schoolId: "s1", campusId: null, role: "APP_OWNER", isActive: true },
  ...kids,
];
type Member = { userId: string; leftAt: Date | null };
type Conversation = { id: string; kind: string; schoolId: string; campusId: string | null; classId: string | null; members: Member[] };
const join_ = (...ids: string[]): Member[] => ids.map((userId) => ({ userId, leftAt: null }));
const conversations: Conversation[] = [
  { id: "class-a", kind: "CLASS", schoolId: "s1", campusId: "c1", classId: "A", members: join_("te1", "pa1", "pa2", "owner", ...kids.map((k) => k.id)) },
  { id: "class-b", kind: "CLASS", schoolId: "s1", campusId: "c1", classId: "B", members: join_("te1", "pa1") }, // pa1 has no live link to B
  { id: "class-none", kind: "CLASS", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "pa1") },
  { id: "staff-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "ca1") },
  { id: "family-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "pa2") },
  { id: "inactive-dm", kind: "DIRECT", schoolId: "s1", campusId: "c1", classId: null, members: join_("te1", "gone") },
  { id: "campus-2", kind: "GROUP", schoolId: "s1", campusId: "c2", classId: null, members: join_("te1", "ca1", "ca2", "pa1") },
  { id: "left", kind: "GROUP", schoolId: "s1", campusId: "c1", classId: null, members: [{ userId: "te1", leftAt: new Date() }, ...join_("ca1")] },
  { id: "other-school", kind: "GROUP", schoolId: "s2", campusId: "k1", classId: null, members: join_("x2", "te1", "pa1", "ca1") },
];
const guardianLinks = [{ guardianUserId: "pa1", classId: "A" }];

type Where = Record<string, unknown> & { id?: string; schoolId?: string; campusId?: string };
const scoped = (row: { id: string; schoolId: string; campusId?: string | null }, where: Where) =>
  (!where.id || row.id === where.id) && (!where.schoolId || row.schoolId === where.schoolId) && (!where.campusId || row.campusId === where.campusId);
const person = (id: string) => people.find((p) => p.id === id)!;
const linked = (userId: string, classId: string) => guardianLinks.some((l) => l.guardianUserId === userId && l.classId === classId);

function fakeDb() {
  let memberRows = 0;
  const active = (row: Conversation) => row.members.filter((m) => m.leftAt === null && person(m.userId).isActive);
  const view = (m: Member) => { memberRows += 1; const p = person(m.userId); return { userId: m.userId, memberRole: "MEMBER", lastReadAt: null, user: { id: p.id, fullName: p.id, role: p.role, profileImageUrl: null } }; };
  const db = {
    conversation: {
      findFirst: async ({ where, select }: { where: Where; select?: { members: { where: { OR: Array<{ userId?: string }> } } } }) => {
        const row = conversations.find((c) => scoped(c, where));
        if (!row) return null;
        const onlyFor = select?.members.where.OR[0]?.userId;
        return { ...row, members: active(row).filter((m) => !onlyFor || m.userId === onlyFor || row.kind === "DIRECT").map(view) };
      },
    },
    conversationMember: {
      count: async ({ where }: { where: { schoolId: string; conversationId: string; user: { OR?: Array<{ role: unknown; guardianRelationships?: { some: { AND: [unknown, { student: { classId: string } }] } } }> } } }) => {
        const row = conversations.find((c) => c.id === where.conversationId && c.schoolId === where.schoolId);
        if (!row) return 0;
        const classId = where.user.OR?.[1]?.guardianRelationships?.some.AND[1].student.classId;
        return active(row).filter((m) => !where.user.OR || person(m.userId).role !== "PARENT" || (classId !== undefined && linked(m.userId, classId))).length;
      },
    },
    guardianRelationship: {
      findMany: async ({ where }: { where: { AND: [unknown, { guardianUserId: { in: string[] }; student: { classId: string } }] } }) => {
        const { guardianUserId: g, student: { classId } } = where.AND[1];
        return guardianLinks.filter((l) => g.in.includes(l.guardianUserId) && l.classId === classId).map((l) => ({ guardianUserId: l.guardianUserId }));
      },
    },
    user: {
      findFirst: async ({ where }: { where: Where & { isActive: boolean } }) => people.find((p) => scoped(p, where) && p.isActive) ?? null,
      findMany: async () => [],
    },
    chatSetting: { findUnique: async () => null },
    class: { findMany: async () => [] },
    subject: { findMany: async () => [] },
    timetableSlot: { findMany: async () => [] },
    teachingAssignment: { findMany: async () => [] },
    student: { findFirst: async () => null },
  };
  return { db, memberRows: () => memberRows };
}

const user = (id: string): AuthUser => { const p = person(id); return { userId: p.id, schoolId: p.schoolId, campusId: p.campusId, role: p.role } as AuthUser; };

test("the roster-free access check matches requireMembership for every reader and conversation", async () => {
  const { requireConversationAccess, requireMembership } = await import(src("lib/chat/membership.ts"));
  const allowed = async (check: typeof requireMembership, reader: string, id: string) => check(user(reader), id, fakeDb().db).then(() => true, () => false);
  for (const reader of ["te1", "pa1", "pa2", "ca1", "ca2", "x2", "owner", "kid0"]) {
    for (const { id } of conversations) {
      assert.equal(await allowed(requireConversationAccess, reader, id), await allowed(requireMembership, reader, id), `${reader} -> ${id}`);
    }
  }
  assert.equal(await allowed(requireConversationAccess, "pa1", "class-a"), true, "a linked parent reads the class channel");
  assert.equal(await allowed(requireConversationAccess, "pa2", "class-a"), false, "an unlinked parent is denied");
  assert.equal(await allowed(requireConversationAccess, "x2", "class-a"), false, "school 2 never reads school 1");
  assert.equal(await allowed(requireConversationAccess, "ca2", "class-a"), false, "campus 2 admin never reads campus 1");
  assert.equal(await allowed(requireConversationAccess, "owner", "class-a"), false, "the platform owner is denied");
});

test("a thread call reads one membership row, however large the channel", async () => {
  const { requireConversationAccess, requireMembership } = await import(src("lib/chat/membership.ts"));
  const light = fakeDb();
  await requireConversationAccess(user("kid0"), "class-a", light.db);
  assert.equal(light.memberRows(), 1);
  const full = fakeDb();
  await requireMembership(user("kid0"), "class-a", full.db);
  assert.ok(full.memberRows() > 60, "the roster path still loads every member (kept for detail and send)");
});

test("currentMemberCount equals the roster currentClassMembers keeps", async () => {
  const { currentMemberCount, requireMembership } = await import(src("lib/chat/membership.ts"));
  const checked: string[] = [];
  for (const { id, kind, schoolId, classId } of conversations.filter((c) => c.id !== "left" && c.schoolId === "s1")) {
    const { db } = fakeDb();
    const { row } = await requireMembership(user("te1"), id, db).catch(() => requireMembership(user("ca2"), id, db)).catch(() => ({ row: null }));
    if (!row) continue;
    assert.equal(await currentMemberCount({ id, kind, schoolId, classId }, db), row.members.length, id);
    checked.push(id);
  }
  assert.deepEqual(checked, ["class-a", "class-b", "class-none", "staff-dm", "campus-2"]);
});

test("thread service calls and attachments use the roster-free check; read receipts count before loading", () => {
  const service = readFileSync("src/lib/chat/service.ts", "utf8");
  const fn = (name: string) => service.slice(service.indexOf(`export async function ${name}(`), service.indexOf("\n}\n", service.indexOf(`export async function ${name}(`)));
  assert.match(fn("listMessages"), /await requireConversationAccess\(user, conversationId\);/);
  assert.match(fn("markRead"), /requireConversationAccess\(user, conversationId\)[\s\S]*currentMemberCount\(row\)\) <= 20 \? recipientIds\(\(await requireMembership/);
  for (const path of ["src/lib/chat/attachment-access.ts", "src/app/api/chat/attachments/route.ts", "src/lib/storage/private-upload.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /requireMembership/, path);
  }
});

test("the client drops stale list and older-page answers and batches read receipts", () => {
  const provider = readFileSync("src/components/chat/chat-provider.tsx", "utf8");
  assert.match(provider, /listAbortRef\.current\?\.abort\(\);/);
  assert.match(provider, /fetch\(`\/api\/chat\/conversations\?\$\{params\}`, \{ signal: controller\.signal \}\)/);
  assert.match(provider, /const json = await res\.json\(\);\n\s*if \(!current\(\)\) return;/);
  assert.match(provider, /if \(activeIdRef\.current !== id\) return;\n\s*setMessages\(\(prev\) => \[\.\.\.\(json\.messages/);
  assert.match(provider, /document\.visibilityState !== "visible"/);
  assert.match(provider, /markedIdRef\.current === id \? 1000 : 0/);
  const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
  assert.doesNotMatch(thread, /detail\.members\.some/);
  assert.match(thread, /othersLastReadAt !== null && othersLastReadAt >= message\.createdAt/);
});

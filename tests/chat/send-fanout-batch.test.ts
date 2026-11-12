import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1878: a send into a big class channel re-ran the guardian check three times, looked up presence one member
// at a time and published each bell update separately. The send must reach exactly the same people (live push and
// notification fallback) with one guardian query, one presence lookup and one pipelined publish, whatever the size.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Call = { op: string; args: unknown };
const calls: Call[] = [];
const online = new Set<string>();
const published: Array<{ userIds: string[]; type: string }> = [];
const pipelined: string[] = [];
let pipelineExecs = 0;

/** Every value of `key` anywhere in a Prisma where (string or { in }). */
function collect(where: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(where)) where.forEach((item) => collect(item, key, out));
  else if (where && typeof where === "object") for (const [k, v] of Object.entries(where)) {
    if (k === key && typeof v === "string") out.push(v);
    else if (k === key && v && typeof v === "object" && Array.isArray((v as { in?: unknown }).in)) out.push(...(v as { in: string[] }).in);
    else collect(v, key, out);
  }
  return out;
}

const SIZE = 150;
const member = (userId: string, role: string, extra: Record<string, unknown> = {}) => ({
  userId, memberRole: "MEMBER", unreadCount: 0, lastReadAt: null, isMuted: false, isPinned: false, isArchived: false,
  user: { id: userId, fullName: "Synthetic Person", role, profileImageUrl: null }, ...extra,
});
const conversations = [
  {
    id: "class-a-chat", kind: "CLASS", schoolId: "school-a", campusId: "campus-a", classId: "class-a", title: "Class A", isLocked: false,
    members: [
      member("teacher-a", "TEACHER"),
      member("teacher-muted", "TEACHER", { isMuted: true }),
      ...Array.from({ length: SIZE }, (_, i) => member(`parent-a-${i}`, "PARENT")),
      member("parent-lapsed", "PARENT"),
    ],
  },
  {
    id: "class-b-chat", kind: "CLASS", schoolId: "school-b", campusId: "campus-b", classId: "class-b", title: "Class B", isLocked: false,
    members: [member("teacher-b", "TEACHER"), member("parent-b-0", "PARENT"), member("parent-b-1", "PARENT")],
  },
];
// A live guardian link per parent, except parent-lapsed. parent-b-* are linked in school-b only.
const links = [
  ...Array.from({ length: SIZE }, (_, i) => ({ guardianUserId: `parent-a-${i}`, schoolId: "school-a" })),
  { guardianUserId: "parent-b-0", schoolId: "school-b" },
  { guardianUserId: "parent-b-1", schoolId: "school-b" },
];

let messageSeq = 0;
const db = {
  conversation: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId?: string } }) => {
      calls.push({ op: "conversation.findFirst", args: where });
      return conversations.find((c) => c.id === where.id && c.schoolId === where.schoolId && (!where.campusId || c.campusId === where.campusId)) ?? null;
    },
    update: async () => ({}),
  },
  guardianRelationship: {
    findMany: async ({ where }: { where: unknown }) => {
      calls.push({ op: "guardianRelationship.findMany", args: where });
      const ids = collect(where, "guardianUserId");
      const schools = collect(where, "schoolId");
      assert.ok(schools.length > 0, "guardian check carries the school");
      return links.filter((l) => ids.includes(l.guardianUserId) && schools.includes(l.schoolId)).map((l) => ({ guardianUserId: l.guardianUserId }));
    },
  },
  chatSetting: { findUnique: async () => null },
  chatMessage: {
    findFirst: async () => null,
    create: async ({ data }: { data: { conversationId: string; senderId: string; body: string; kind: string } }) => ({
      id: `m-${++messageSeq}`, conversationId: data.conversationId, kind: data.kind, body: data.body, senderId: data.senderId,
      sender: { id: data.senderId, fullName: "Synthetic Person", role: "TEACHER", profileImageUrl: null },
      replyTo: null, replyToId: null, attachments: [], deletedAt: null, editedAt: null, isUrgent: false, createdAt: new Date(), updatedAt: new Date(),
    }),
  },
  conversationMember: { updateMany: async () => ({ count: 0 }) },
  school: { findUnique: async ({ where }: { where: { id: string } }) => (calls.push({ op: "school.findUnique", args: where }), { timezone: "Asia/Karachi" }) },
  notification: {
    findMany: async ({ where }: { where: unknown }) => (calls.push({ op: "notification.findMany", args: where }), []),
    updateMany: async () => ({ count: 0 }),
    createManyAndReturn: async ({ data }: { data: Array<{ userId: string; schoolId: string; campusId: string }> }) => {
      calls.push({ op: "notification.createManyAndReturn", args: data });
      return data.map((row, i) => ({ id: `n-${i}`, ...row }));
    },
  },
};

mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: db, tenantTransaction: async (fn: (tx: unknown) => unknown) => fn(db) } });
mock.module(src("lib/chat/realtime.ts"), {
  namedExports: {
    publishToUsers: async (userIds: string[], event: { type: string }) => { published.push({ userIds, type: event.type }); },
    whoIsOnline: async (userIds: string[]) => (calls.push({ op: "whoIsOnline", args: userIds }), new Set(userIds.filter((id) => online.has(id)))),
  },
});
mock.module(src("lib/queue/connection.ts"), {
  namedExports: {
    redis: { pipeline: () => { const p = { publish: (channel: string) => (pipelined.push(channel), p), exec: async () => (pipelineExecs++, []) }; return p; } },
  },
});

const actor = (userId: string, role: AuthUser["role"], schoolId: string, campusId: string): AuthUser =>
  ({ userId, schoolId, campusId, role, fullName: "Synthetic Person", email: "synthetic@example.invalid", accessVersion: 1 }) as AuthUser;

function reset() {
  calls.length = 0; published.length = 0; pipelined.length = 0; pipelineExecs = 0; online.clear();
}
const count = (op: string) => calls.filter((c) => c.op === op).length;

test("a class send reaches current members with a fixed number of guardian and presence lookups", async () => {
  const { sendMessage } = await import("../../src/lib/chat/service");
  reset();
  for (let i = 0; i < SIZE; i += 3) online.add(`parent-a-${i}`);
  await sendMessage(actor("teacher-a", "TEACHER", "school-a", "campus-a"), "class-a-chat", { body: "Trip forms due Friday" });

  assert.equal(count("guardianRelationship.findMany"), 1, "guardian check runs once, not once per stage");
  assert.equal(count("whoIsOnline"), 1, "one presence lookup for the room");

  const live = published.find((p) => p.type === "message")!;
  const expected = ["teacher-muted", ...Array.from({ length: SIZE }, (_, i) => `parent-a-${i}`)].sort();
  assert.deepEqual([...live.userIds].filter((id) => id !== "teacher-a").sort(), expected, "lapsed parent gets no live push");

  const presence = calls.find((c) => c.op === "whoIsOnline")!.args as string[];
  assert.ok(!presence.includes("teacher-muted") && !presence.includes("teacher-a") && !presence.includes("parent-lapsed"));

  const created = calls.find((c) => c.op === "notification.createManyAndReturn")!.args as Array<{ userId: string; schoolId: string; campusId: string }>;
  const offline = Array.from({ length: SIZE }, (_, i) => `parent-a-${i}`).filter((id) => !online.has(id)).sort();
  assert.deepEqual(created.map((n) => n.userId).sort(), offline, "bell only for offline, unmuted, current members");
  assert.ok(created.every((n) => n.schoolId === "school-a" && n.campusId === "campus-a"));
  assert.equal(pipelineExecs, 1, "one pipelined publish for every bell update");
  assert.deepEqual(pipelined.sort(), offline.map((id) => `notif:${id}`).sort());
});

test("school-b send stays in school-b", async () => {
  const { sendMessage } = await import("../../src/lib/chat/service");
  reset();
  await sendMessage(actor("teacher-b", "TEACHER", "school-b", "campus-b"), "class-b-chat", { body: "Hello" });
  const created = calls.find((c) => c.op === "notification.createManyAndReturn")!.args as Array<{ userId: string; schoolId: string; campusId: string }>;
  assert.deepEqual(created.map((n) => n.userId).sort(), ["parent-b-0", "parent-b-1"]);
  assert.ok(created.every((n) => n.schoolId === "school-b" && n.campusId === "campus-b"));
  assert.equal(count("guardianRelationship.findMany"), 1);
});

test("denied: another school's or another campus's teacher and a lapsed parent cannot send", async () => {
  const { sendMessage } = await import("../../src/lib/chat/service");
  for (const user of [
    actor("teacher-b", "TEACHER", "school-b", "campus-b"),
    actor("teacher-a", "TEACHER", "school-a", "campus-other"),
    actor("parent-lapsed", "PARENT", "school-a", "campus-a"),
  ]) {
    reset();
    await assert.rejects(sendMessage(user, "class-a-chat", { body: "x" }), (err: { status?: number }) => err.status === 404);
    assert.equal(published.length, 0);
    assert.equal(count("notification.createManyAndReturn"), 0);
  }
});

test("everyone online: no notification rows and no publish", async () => {
  const { sendMessage } = await import("../../src/lib/chat/service");
  reset();
  online.add("parent-b-0").add("parent-b-1");
  await sendMessage(actor("teacher-b", "TEACHER", "school-b", "campus-b"), "class-b-chat", { body: "Hello" });
  assert.equal(count("notification.findMany"), 0);
  assert.equal(pipelineExecs, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import { ACCESS_DENIED } from "../../src/lib/auth/policy";
import { downloadChatAttachment } from "../../src/lib/chat/attachment-access";
import { classGuardianMembershipWhere, currentClassMembers, type ConversationRow } from "../../src/lib/chat/membership";
import { privateDownloadResponse } from "../../src/lib/storage/private-download";

const parent: AuthUser = { userId: "parent-a", schoolId: "school-a", campusId: "campus-a", role: "PARENT", email: "synthetic@example.invalid", accessVersion: 4 };
const bytes = "SYNTHETIC PRIVATE CHAT CONTENT";
function stream() { return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(bytes)); controller.close(); } }); }
function fixture() {
  const member = (userId: string, role: "PARENT" | "TEACHER") => ({ userId, memberRole: "MEMBER", unreadCount: 0, lastReadAt: null, isMuted: false, isPinned: false, isArchived: false, user: { id: userId, fullName: "Synthetic", role, profileImageUrl: null } });
  const state = { actorCurrent: true, attachmentExists: true, memberPresent: true, guardianCurrent: true, teacherAssigned: true, direct: false, reads: [] as string[], key: "chat/school-a/conversation-a/file.pdf", calls: [] as { model: string; args: unknown }[] };
  const db = {
    user: { findFirst: async (args: { where: { id: string } }) => {
      state.calls.push({ model: "user", args });
      return args.where.id === parent.userId ? state.actorCurrent ? { id: parent.userId } : null : { id: "teacher-a", role: "TEACHER", campusId: "campus-a", isActive: true };
    } },
    chatAttachment: { findFirst: async (args: unknown) => { state.calls.push({ model: "attachment", args }); return state.attachmentExists ? { id: "attachment-a", fileName: "Synthetic.pdf", contentType: "application/pdf", storageKey: state.key, message: { conversationId: "conversation-a" } } : null; } },
    conversation: { findFirst: async (args: unknown) => { state.calls.push({ model: "conversation", args }); return { id: "conversation-a", schoolId: "school-a", campusId: "campus-a", classId: "class-a", kind: state.direct ? "DIRECT" : "CLASS", members: [...(state.memberPresent ? [member(parent.userId, "PARENT")] : []), member("teacher-a", "TEACHER")] } as ConversationRow; } },
    guardianRelationship: { findMany: async (args: unknown) => { state.calls.push({ model: "guardian", args }); return state.guardianCurrent ? [{ guardianUserId: parent.userId }] : []; } },
    chatSetting: { findUnique: async () => null },
    class: { findMany: async () => state.teacherAssigned ? [{ id: "class-a" }] : [] },
    subject: { findMany: async () => [] }, timetableSlot: { findMany: async () => [] },
    student: { findFirst: async () => state.guardianCurrent ? { id: "student-a" } : null },
  } as unknown as TxClient;
  const read = async (key: string) => { state.reads.push(key); return stream(); };
  return { state, db, read, download: () => downloadChatAttachment(parent, "attachment-a", db, read) };
}

test("known chat attachment streams only after current account, record, membership and guardian checks", async () => {
  const { state, download } = fixture();
  const response = await download();
  assert.equal(response.status, 200); assert.equal(await response.text(), bytes);
  assert.deepEqual(state.reads, [state.key]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-disposition")!, /^attachment;/);
  assert.deepEqual((state.calls.find(call => call.model === "user")!.args as { where: unknown }).where, { id: parent.userId, schoolId: parent.schoolId, isActive: true, role: "PARENT", campusId: parent.campusId, accessVersion: 4 });
  assert.deepEqual((state.calls.find(call => call.model === "attachment")!.args as { where: unknown }).where, { id: "attachment-a", schoolId: "school-a", message: { schoolId: "school-a", deletedAt: null, conversation: { schoolId: "school-a" } } });
});

test("retained attachment cannot survive membership or guardian revocation, and restoration is fresh", async () => {
  const { state, download } = fixture();
  await (await download()).text();
  for (const flag of ["memberPresent", "guardianCurrent", "actorCurrent", "attachmentExists"] as const) {
    state[flag] = false;
    await assert.rejects(download, { status: 403, message: ACCESS_DENIED });
    assert.equal(state.reads.length, 1, `${flag}: denied request must not touch storage`);
    state[flag] = true;
  }
  assert.equal(await (await download()).text(), bytes);
  assert.equal(state.reads.length, 2);
});

test("exact class and selected guardian filters compose with live child authority", () => {
  const where = classGuardianMembershipWhere("school-a", "class-a", [parent.userId]);
  const [authority, selection] = where.AND as { schoolId?: string; student?: unknown; guardian?: unknown }[];
  assert.equal(authority.schoolId, "school-a");
  assert.deepEqual(selection, { guardianUserId: { in: [parent.userId] }, student: { classId: "class-a" } });
  assert.deepEqual(authority.guardian, { isActive: true, role: "PARENT", schoolId: "school-a" });
  assert.deepEqual(authority.student, { archivedAt: null, consolidatedIntoId: null, status: { equals: "active", mode: "insensitive" }, schoolId: "school-a", campus: { archivedAt: null, schoolId: "school-a" } });
});

test("direct attachment rechecks a teacher's assignment and guardian relationship on every read", async () => {
  const { state, download } = fixture(); state.direct = true;
  assert.equal(await (await download()).text(), bytes);
  state.teacherAssigned = false;
  await assert.rejects(download, { status: 403, message: ACCESS_DENIED });
  state.teacherAssigned = true; state.guardianCurrent = false;
  await assert.rejects(download, { status: 403, message: ACCESS_DENIED });
  assert.equal(state.reads.length, 1);
});

test("delivery recipient recheck removes a newly revoked guardian from an already loaded class", async () => {
  const { state, db } = fixture();
  const loaded = await db.conversation.findFirst({ where: { id: "conversation-a" } }) as ConversationRow;
  assert.deepEqual((await currentClassMembers(loaded, db)).members.map(member => member.userId), [parent.userId, "teacher-a"]);
  state.guardianCurrent = false;
  assert.deepEqual((await currentClassMembers(loaded, db)).members.map(member => member.userId), ["teacher-a"]);
  assert.equal(loaded.members.length, 2, "delivery filtering does not mutate a previously loaded row");
});

test("stored attachment cannot turn authorized membership into arbitrary object access", async () => {
  const { state, download } = fixture();
  for (const key of ["chat/other-school/conversation-a/file.pdf", "chat/school-a/other-thread/file.pdf", "chat/school-a/conversation-a/", "chat/school-a/conversation-a/../secret.pdf", "chat/school-a/conversation-a/a\\b", "chat/school-a/conversation-a/..", "chat/school-a/conversation-a/a\0b"]) {
    state.key = key;
    await assert.rejects(download, { status: 403, message: ACCESS_DENIED });
  }
  assert.deepEqual(state.reads, []);
});

test("platform operator never gains school attachment access", async () => {
  const { state, db, read } = fixture();
  await assert.rejects(() => downloadChatAttachment({ ...parent, role: "APP_OWNER" }, "attachment-a", db, read), { status: 403, message: ACCESS_DENIED });
  assert.deepEqual(state.calls, []); assert.deepEqual(state.reads, []);
});

test("private streaming prevents active document execution and filename header injection", async () => {
  const response = await privateDownloadResponse("synthetic", "../../سند\r\nInjected: header.html", { contentType: "text/html", inlineImage: true }, async () => stream());
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.match(response.headers.get("content-disposition")!, /^attachment; /);
  assert.doesNotMatch(response.headers.get("content-disposition")!, /[\r\n]/);
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const image = await privateDownloadResponse("synthetic", "photo.png", { contentType: "image/png", inlineImage: true }, async () => stream());
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.match(image.headers.get("content-disposition")!, /^inline; /);
});

test("storage failure yields a neutral uncached response without a raw object location", async () => {
  const response = await privateDownloadResponse("private-key", "private-name.pdf", {}, async () => { throw new Error("s3://private-bucket/private-key"); });
  assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(await response.json(), { error: "This file is unavailable. Please try again." });
});

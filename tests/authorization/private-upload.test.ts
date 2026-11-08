import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import { JWT_SECRET } from "../../src/lib/auth/secret";
import { authorizePrivateUpload, createPrivateUploadUrl, readPrivateUploadBody, verifyPrivateUploadIntent, type PrivateUploadIntent } from "../../src/lib/storage/private-upload";

const actor: AuthUser = { userId: "admin-a", schoolId: "school-a", campusId: "campus-a", role: "CAMPUS_ADMIN", email: "synthetic@example.invalid", accessVersion: 3 };
const intent: PrivateUploadIntent = { kind: "student", targetId: "student-a", storageKey: "student-docs/campus-a/student-a/file.pdf", contentType: "application/pdf", sizeBytes: 4 };

test("a private upload intent grants nothing to another actor, school, role or changed scope", async () => {
  const url = await createPrivateUploadUrl(actor, { ...intent, fileName: "Synthetic.pdf" });
  assert.ok(url.startsWith("/api/uploads/file?intent="));
  const token = new URL(url, "http://synthetic.invalid").searchParams.get("intent")!;
  assert.deepEqual(await verifyPrivateUploadIntent(token, actor), intent);
  for (const changed of [{ userId: "other" }, { schoolId: "other" }, { campusId: "other" }, { role: "TEACHER" as const }, { accessVersion: 4 }]) {
    await assert.rejects(verifyPrivateUploadIntent(token, { ...actor, ...changed }), { status: 403 });
  }
  await assert.rejects(verifyPrivateUploadIntent(token + "invalid", actor), { status: 403 });
});

test("expired or wrong-purpose upload intents are rejected", async () => {
  const payload = { intent, actor: { userId: actor.userId, schoolId: actor.schoolId, campusId: actor.campusId, role: actor.role, accessVersion: actor.accessVersion } };
  for (const [audience, expiry] of [["private-upload", 1], ["login", Math.floor(Date.now() / 1000) + 60]] as const) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuer("skoolee-private-upload").setAudience(audience).setExpirationTime(expiry).sign(JWT_SECRET);
    await assert.rejects(verifyPrivateUploadIntent(token, actor), { status: 403 });
  }
});

test("streamed uploads enforce exact bytes before a storage effect", async () => {
  assert.deepEqual(await readPrivateUploadBody(new Request("http://synthetic.invalid", { method: "PUT", body: "ABCD" }), 4), new TextEncoder().encode("ABCD"));
  await assert.rejects(readPrivateUploadBody(new Request("http://synthetic.invalid", { method: "PUT", body: "ABC" }), 4), { status: 400 });
  await assert.rejects(readPrivateUploadBody(new Request("http://synthetic.invalid", { method: "PUT", body: "ABCDE" }), 4), { status: 413 });
  await assert.rejects(readPrivateUploadBody(new Request("http://synthetic.invalid", { method: "PUT", body: "ABCD", headers: { "content-length": "99999999" } }), 4), { status: 400 });
});

test("an oversized stream is refused even when transport cancellation never settles", { timeout: 1000 }, async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("ABCDE")); },
    cancel() { return new Promise<void>(() => {}); },
  });
  const request = new Request("http://synthetic.invalid", { method: "PUT", body, duplex: "half" } as RequestInit);
  await assert.rejects(readPrivateUploadBody(request, 4), { status: 413 });
});

test("a retained upload rechecks current permission and exact target key", async () => {
  const state = { current: true, allowed: true, student: true };
  const db = {
    user: { findFirst: async () => state.current ? { id: actor.userId } : null },
    rolePermission: { findMany: async () => [{ module: "students", canView: true, canAdd: false, canEdit: state.allowed, canDelete: false }] },
    student: { findFirst: async ({ where }: { where: unknown }) => { assert.deepEqual(where, { id: "student-a", schoolId: "school-a", campusId: "campus-a" }); return state.student ? { id: "student-a", campusId: "campus-a" } : null; } },
  } as unknown as TxClient;
  await authorizePrivateUpload(actor, intent, db);
  state.allowed = false; await assert.rejects(authorizePrivateUpload(actor, intent, db), { status: 403 }); state.allowed = true;
  state.current = false; await assert.rejects(authorizePrivateUpload(actor, intent, db), { status: 403 }); state.current = true;
  state.student = false; await assert.rejects(authorizePrivateUpload(actor, intent, db), { status: 403 }); state.student = true;
  await assert.rejects(authorizePrivateUpload(actor, { ...intent, storageKey: "student-docs/foreign/student-a/file.pdf" }, db), { status: 403 });
});

test("staff uploads require current staff permission and the target within the actor's campus", async () => {
  const staffIntent: PrivateUploadIntent = { ...intent, kind: "staff", targetId: "staff-a", storageKey: "staff-docs/campus-a/staff-a/file.pdf" };
  const state = { permission: true, targetVisible: true };
  const db = {
    user: { findFirst: async ({ where }: { where: { id: string } }) => {
      if (where.id === actor.userId) return { id: actor.userId };
      assert.deepEqual(where, { id: "staff-a", schoolId: actor.schoolId, campusId: actor.campusId });
      return state.targetVisible ? { id: "staff-a" } : null;
    } },
    campus: { findFirst: async ({ where }: { where: unknown }) => { assert.deepEqual(where, { id: "campus-a", schoolId: "school-a" }); return { id: "campus-a" }; } },
    rolePermission: { findMany: async () => [{ module: "staff", canView: true, canAdd: false, canEdit: state.permission, canDelete: false }] },
  } as unknown as TxClient;
  await authorizePrivateUpload(actor, staffIntent, db);
  state.permission = false; await assert.rejects(authorizePrivateUpload(actor, staffIntent, db), { status: 403 });
  state.permission = true; state.targetVisible = false;
  await assert.rejects(authorizePrivateUpload(actor, staffIntent, db), { status: 403 });
  state.targetVisible = true;
  await assert.rejects(authorizePrivateUpload(actor, { ...staffIntent, storageKey: "staff-docs/campus-a/another-staff/file.pdf" }, db), { status: 403 });
});

test("retained chat upload loses authority when file sharing or the exact class guardian grant is revoked", async () => {
  const parent: AuthUser = { ...actor, userId: "parent-a", role: "PARENT" };
  const chatIntent: PrivateUploadIntent = { ...intent, kind: "chat", targetId: "conversation-a", storageKey: "chat/school-a/conversation-a/file.pdf" };
  const state = { sharing: true, guardian: true, conversationQueries: 0 };
  const db = {
    user: { findFirst: async () => ({ id: parent.userId }) },
    chatSetting: { findUnique: async () => ({ attachmentsEnabled: state.sharing }) },
    conversation: { findFirst: async () => {
      state.conversationQueries += 1;
      return { id: "conversation-a", schoolId: actor.schoolId, campusId: actor.campusId, classId: "class-a", kind: "CLASS", members: [{ userId: parent.userId, user: { role: "PARENT" } }] };
    } },
    guardianRelationship: { findMany: async () => state.guardian ? [{ guardianUserId: parent.userId }] : [] },
  } as unknown as TxClient;
  await authorizePrivateUpload(parent, chatIntent, db);
  state.sharing = false;
  await assert.rejects(authorizePrivateUpload(parent, chatIntent, db), { status: 403 });
  assert.equal(state.conversationQueries, 1, "disabled sharing denies before loading membership");
  state.sharing = true; state.guardian = false;
  await assert.rejects(authorizePrivateUpload(parent, chatIntent, db), { status: 404 });
  state.guardian = true;
  await assert.rejects(authorizePrivateUpload(parent, { ...chatIntent, storageKey: "chat/school-a/other-thread/file.pdf" }, db), { status: 403 });
});

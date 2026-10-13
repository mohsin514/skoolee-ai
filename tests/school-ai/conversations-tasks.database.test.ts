import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { createWorkspaceRecord, updateWorkspaceRecord, getWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createPrivateConversation, getPrivateConversation, listPrivateConversations, updatePrivateConversation } from "../../src/lib/school-ai/conversation-service";
import { beginSchoolAiRequest, completeSchoolAiRequest, failSchoolAiRequest, type SchoolAiRequestClaim } from "../../src/lib/school-ai/requests";
import { createSetupTask, getSetupTask, listSetupTasks, setupTaskOptions, updateSetupTask } from "../../src/lib/school-ai/setup-task-service";
const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated School AI fixture database.");
const raw = new PrismaClient(), schoolId = `ai-private-${randomUUID()}`, campusId = randomUUID(), otherCampus = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), role, campusId: campus, schoolId, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const admin = actor("CAMPUS_ADMIN"), otherAdmin = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), outsider = actor("TEACHER"), accountant = actor("ACCOUNTANT"), wrongCampus = actor("CAMPUS_ADMIN", otherCampus);
before(async () => {
  await raw.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic private conversation school", contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  for (const id of [campusId, otherCampus]) await raw.campus.create({ data: { id, schoolId, regId: id, name: "Synthetic campus", city: "Synthetic" } });
  for (const user of [admin, otherAdmin, teacher, outsider, accountant, wrongCampus]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.rolePermission.create({ data: { schoolId, role: "ACCOUNTANT", module: "ai", canView: true, canAdd: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, teacherId: teacher.userId, name: "Synthetic subject" } });
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });
const scope = { campusId };
const conversation = (user = admin) => createPrivateConversation(user, { ...scope, ...(user.role === "TEACHER" ? { subjectId, classId } : {}), title: "Private question", idempotencyKey: randomUUID() });
const turn = async (conversationId: string, version: number, message = "A private question", user = admin, key = randomUUID()) => {
  const input = { key, fingerprint: `${message}:en:${conversationId}`, ...scope, ...(user.role === "TEACHER" ? { subjectId, classId } : {}), conversationId, expectedConversationVersion: version, userMessage: message, requestLanguage: "en" as const };
  const result = await beginSchoolAiRequest(user, input); assert.equal(result.state, "CLAIMED"); return { claim: (result as { state: "CLAIMED"; claim: SchoolAiRequestClaim }).claim, input };
};
const complete = (claim: SchoolAiRequestClaim, reply = "A saved response", versions: Record<string, number> = {}, user = admin) => schoolAiTransaction(user, tx => completeSchoolAiRequest(user, claim, { reply, contextRecordIds: Object.keys(versions), contextVersions: versions }, tx));
const draft = () => createWorkspaceRecord(admin, { kind: "ONBOARDING", campusId, title: "Private setup with unrelated information", idempotencyKey: randomUUID(), data: { path: "new", answers: { schoolName: "Original school", country: "private unrelated value" }, confirmedKeys: ["schoolName"], step: "profile" } });
const task = async (fieldKey = "schoolName", assigneeId = teacher.userId) => { const record = await draft(); return { record, task: await createSetupTask(admin, { recordId: record.id, fieldKey, assigneeId, instructions: "Provide the confirmed name only", idempotencyKey: randomUUID() }) }; };

test("conversation creation is exact and race-safe; private history is not readable by another manager or campus", async () => {
  const input = { campusId, title: "Exact private conversation", idempotencyKey: randomUUID() };
  const rows = await Promise.all([createPrivateConversation(admin, input), createPrivateConversation(admin, input)]); assert.equal(rows[0].id, rows[1].id);
  await assert.rejects(() => createPrivateConversation(admin, { ...input, title: "Changed" }), { status: 409 });
  const claimed = await turn(rows[0].id, 0); await complete(claimed.claim);
  const saved = await getPrivateConversation(admin, rows[0].id); assert.equal(saved.conversation.version, 1); assert.equal(saved.exchanges[0].turns?.[1].text, "A saved response");
  for (const user of [otherAdmin, wrongCampus]) await assert.rejects(() => getPrivateConversation(user, rows[0].id), { status: 404 });
  assert(!(await listPrivateConversations(otherAdmin, scope)).conversations.some(item => item.id === rows[0].id));
});
test("pending turns serialize, recover exact language/key and reject stale new turns", async () => {
  const saved = await conversation(), started = await turn(saved.id, 0);
  const recovery = (await getPrivateConversation(admin, saved.id)).recovery; assert.equal(recovery?.key, started.input.key); assert.equal(recovery?.language, "en");
  await assert.rejects(() => turn(saved.id, 1, "Second request"), { status: 409 });
  await assert.rejects(() => updatePrivateConversation(admin, saved.id, { version: 1, action: "archive" }), { status: 409 });
  await failSchoolAiRequest(admin, started.claim);
  await assert.rejects(() => beginSchoolAiRequest(admin, started.input), { status: 409 });
  const retried = await beginSchoolAiRequest(admin, { ...started.input, retryFailed: true }); assert.equal(retried.state, "CLAIMED");
  if (retried.state !== "CLAIMED") throw new Error("Expected retry");
  await assert.rejects(() => complete(started.claim), { status: 409 });
  await complete(retried.claim);
  assert.equal((await beginSchoolAiRequest(admin, started.input)).state, "COMPLETED");
  await assert.rejects(() => turn(saved.id, 0, "Stale new request"), { status: 409 });
});
test("expired leases can be retried explicitly and archived conversations resume at a fresh version", async () => {
  const saved = await conversation(), started = await turn(saved.id, 0);
  await raw.schoolAiRequest.update({ where: { id: started.claim.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => complete(started.claim), { status: 409 });
  const retry = await beginSchoolAiRequest(admin, { ...started.input, retryFailed: true }); assert.equal(retry.state, "CLAIMED"); if (retry.state !== "CLAIMED") return;
  await complete(retry.claim);
  const archived = await updatePrivateConversation(admin, saved.id, { version: 1, action: "archive" }); assert(archived.archivedAt);
  await assert.rejects(() => turn(saved.id, archived.version), { status: 409 });
  assert((await listPrivateConversations(admin, { ...scope, archived: true })).conversations.some(item => item.id === saved.id));
  const resumed = await updatePrivateConversation(admin, saved.id, { version: archived.version, action: "resume" }); assert.equal(resumed.archivedAt, null);
  const next = await turn(saved.id, resumed.version, "A resumed question"); assert.equal(next.claim.history?.length, 2); await complete(next.claim);
});
test("evidence revocation hides both the original and derived reply, prevents replay and removes model context", async () => {
  let evidence = await createWorkspaceRecord(admin, { kind: "POLICY", campusId, title: "Fees evidence", idempotencyKey: randomUUID(), data: { scope: "finance", mode: "approval_required", requiresApproval: true, instructions: "School fees require review" } });
  evidence = await updateWorkspaceRecord(admin, evidence.id, { version: evidence.version, action: "approve" });
  const saved = await conversation(), first = await turn(saved.id, 0); await complete(first.claim, "Fees summary", { [evidence.id]: evidence.version });
  const second = await turn(saved.id, 1, "Explain that summary"); assert.equal(second.claim.history?.length, 2); assert.deepEqual(second.claim.historyEvidenceVersions, { [evidence.id]: evidence.version }); await complete(second.claim, "Derived fee answer");
  await raw.rolePermission.create({ data: { schoolId, role: admin.role, module: "fees", canView: false, canAdd: true, canEdit: true } });
  try {
    const page = await getPrivateConversation(admin, saved.id); assert.equal(page.exchanges.length, 2); assert(page.exchanges.every(item => item.hidden && !item.turns));
    await assert.rejects(() => beginSchoolAiRequest(admin, second.input), { status: 403 });
    const next = await turn(saved.id, 2, "A new unrelated question"); assert.deepEqual(next.claim.history, []); await complete(next.claim);
  } finally { await raw.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "fees" } }); }
});
test("edited evidence stays historical in the UI but never silently supplies old facts to new prompts", async () => {
  let evidence = await createWorkspaceRecord(admin, { kind: "POLICY", campusId, title: "School policy", idempotencyKey: randomUUID(), data: { scope: "school", mode: "approval_required", requiresApproval: true, instructions: "Reviewed policy" } }); evidence = await updateWorkspaceRecord(admin, evidence.id, { version: evidence.version, action: "approve" });
  const saved = await conversation(), first = await turn(saved.id, 0); await complete(first.claim, "Original policy", { [evidence.id]: evidence.version });
  const pending = await turn(saved.id, 1, "Followup before edit");
  await updateWorkspaceRecord(admin, evidence.id, { version: evidence.version, action: "save", data: { ...evidence.data, instructions: "New unapproved policy" } });
  await assert.rejects(() => complete(pending.claim), { status: 409 }); await failSchoolAiRequest(admin, pending.claim);
  assert.equal((await getPrivateConversation(admin, saved.id)).exchanges[0].hidden, false);
  const next = await turn(saved.id, 2, "New question after edit"); assert.deepEqual(next.claim.history, []); await complete(next.claim);
});
test("teacher subject and current account grants apply to historical conversations", async () => {
  const saved = await conversation(teacher), first = await turn(saved.id, 0, "Teacher question", teacher); await complete(first.claim, "Assigned subject response", {}, teacher);
  await raw.subject.update({ where: { id: subjectId }, data: { teacherId: outsider.userId } });
  try { await assert.rejects(() => getPrivateConversation(teacher, saved.id), { status: 403 }); } finally { await raw.subject.update({ where: { id: subjectId }, data: { teacherId: teacher.userId } }); }
  await raw.user.update({ where: { id: teacher.userId }, data: { accessVersion: { increment: 1 } } });
  try { await assert.rejects(() => getPrivateConversation(teacher, saved.id), { status: 403 }); } finally { await raw.user.update({ where: { id: teacher.userId }, data: { accessVersion: 0 } }); }
});
test("conversation pagination retains all exchanges in stable version order", async () => {
  const saved = await conversation();
  for (let index = 0; index < 22; index++) { const next = await turn(saved.id, index, `Question ${index}`); await complete(next.claim, `Response ${index}`); }
  const page = await getPrivateConversation(admin, saved.id); assert.equal(page.exchanges.length, 20); assert.equal(page.nextVersion, 3);
  const earlier = await getPrivateConversation(admin, saved.id, page.nextVersion!); assert.deepEqual(earlier.exchanges.map(item => item.version), [1, 2]); assert.equal(earlier.nextVersion, null);
});
test("delegation reveals only a question; assignee proposes and manager accepts an unconfirmed new setup draft", async () => {
  const created = await task();
  await assert.rejects(() => getWorkspaceRecord(teacher, created.record.id), { status: 404 });
  const accessible = await getSetupTask(teacher, created.task.id); assert.equal(accessible.currentFact, undefined); assert(!JSON.stringify(accessible).includes("private unrelated value"));
  await assert.rejects(() => getSetupTask(outsider, created.task.id), { status: 404 });
  await assert.rejects(() => getSetupTask(wrongCampus, created.task.id), { status: 404 });
  const answered = await updateSetupTask(teacher, created.task.id, { action: "answer", version: 1, answer: "New proposed name" }); assert.equal(answered.task.status, "ANSWERED");
  assert.equal((await getWorkspaceRecord(admin, created.record.id)).version, created.record.version);
  await assert.rejects(() => updateSetupTask(teacher, created.task.id, { action: "accept", version: 2, recordVersion: 1 }), { status: 403 });
  const accepted = await updateSetupTask(admin, created.task.id, { action: "accept", version: 2, recordVersion: 1 }); assert.equal(accepted.task.status, "ACCEPTED"); assert.equal(accepted.record?.status, "DRAFT"); assert.equal(accepted.record?.version, 2);
  assert.equal((accepted.record?.data.answers as Record<string, string>).schoolName, "New proposed name"); assert.deepEqual(accepted.record?.data.confirmedKeys, []);
  const replay = await updateSetupTask(admin, created.task.id, { action: "accept", version: 2, recordVersion: 1 }); assert.equal(replay.record?.version, 2);
  assert.deepEqual((await getSetupTask(admin, created.task.id)).revisions.map(item => item.action), ["ACCEPT", "ANSWER", "CREATE"]);
});
test("delegation is idempotent, blocks duplicate open questions and stale acceptance preserves both versions", async () => {
  const record = await draft(), input = { recordId: record.id, fieldKey: "schoolName", assigneeId: teacher.userId, instructions: "Review", idempotencyKey: randomUUID() };
  const created = await Promise.all([createSetupTask(admin, input), createSetupTask(admin, input)]); assert.equal(created[0].id, created[1].id);
  await assert.rejects(() => createSetupTask(admin, { ...input, idempotencyKey: randomUUID() }), { status: 409 });
  await assert.rejects(() => createSetupTask(admin, { ...input, instructions: "Changed" }), { status: 409 });
  await updateSetupTask(teacher, created[0].id, { action: "answer", version: 1, answer: "Proposed" });
  await updateWorkspaceRecord(admin, record.id, { version: 1, action: "save", title: "Concurrent edit" });
  await assert.rejects(() => updateSetupTask(admin, created[0].id, { action: "accept", version: 2, recordVersion: 1 }), { status: 409 });
  assert.equal((await getSetupTask(admin, created[0].id)).task.status, "ANSWERED"); assert.equal((await getWorkspaceRecord(admin, record.id)).version, 2);
  await updateSetupTask(admin, created[0].id, { action: "cancel", version: 2 });
  await assert.rejects(() => updateSetupTask(teacher, created[0].id, { action: "answer", version: 3, answer: "Too late" }), { status: 409 });
  assert.equal((await createSetupTask(admin, { ...input, idempotencyKey: randomUUID() })).status, "OPEN");
});
test("assignment grants and live membership are rechecked for answering, accepting and history", async () => {
  const created = await task("feePolicy", accountant.userId);
  const options = await setupTaskOptions(admin, created.record.id, "feePolicy"); assert(options.staff.some(item => item.id === accountant.userId));
  await updateSetupTask(accountant, created.task.id, { action: "answer", version: 1, answer: "Monthly fees require review" });
  await raw.rolePermission.create({ data: { schoolId, role: "ACCOUNTANT", module: "fees", canView: false, canAdd: true, canEdit: true } });
  try {
    assert(!(await setupTaskOptions(admin, created.record.id, "feePolicy")).staff.some(item => item.id === accountant.userId));
    await assert.rejects(() => getSetupTask(accountant, created.task.id), { status: 403 });
    assert.equal((await listSetupTasks(accountant, scope)).tasks.length, 0);
    await assert.rejects(() => updateSetupTask(admin, created.task.id, { action: "accept", version: 2, recordVersion: 1 }), { status: 403 });
  } finally { await raw.rolePermission.deleteMany({ where: { schoolId, role: "ACCOUNTANT", module: "fees" } }); }
  await raw.user.update({ where: { id: accountant.userId }, data: { isActive: false } });
  try { await assert.rejects(() => updateSetupTask(admin, created.task.id, { action: "accept", version: 2, recordVersion: 1 }), { status: 403 }); } finally { await raw.user.update({ where: { id: accountant.userId }, data: { isActive: true } }); }
});
test("invalid proposed field values never modify setup, and archived setup hides task details", async () => {
  const created = await task("timezone"); await updateSetupTask(teacher, created.task.id, { action: "answer", version: 1, answer: "Invented/Timezone" });
  await assert.rejects(() => updateSetupTask(admin, created.task.id, { action: "accept", version: 2, recordVersion: 1 }), { status: 400 });
  assert.equal((await getWorkspaceRecord(admin, created.record.id)).version, 1);
  await updateWorkspaceRecord(admin, created.record.id, { action: "archive", version: 1 });
  await assert.rejects(() => getSetupTask(teacher, created.task.id), { status: 404 });
});

test("legacy assistant replay retains original workflow domain access after the draft is reclassified", async () => {
  const input = { key: randomUUID(), fingerprint: "legacy-fee-draft-response", campusId };
  const started = await beginSchoolAiRequest(admin, input); assert.equal(started.state, "CLAIMED"); if (started.state !== "CLAIMED") return;
  const record = await createWorkspaceRecord(admin, { kind: "WORKFLOW", title: "Original fees proposal", campusId, idempotencyKey: input.key, data: { goal: "Review school fees", steps: [{ id: "review", title: "Review fees", status: "proposed", module: "fees" }], sourceIds: [], missingInformation: [] } }, { idempotencyFingerprint: input.fingerprint, onCreate: (tx, saved) => completeSchoolAiRequest(admin, started.claim, { reply: "Private finance response", recordId: saved.id }, tx) });
  await updateWorkspaceRecord(admin, record.id, { version: 1, action: "save", data: { goal: "Prepare timetable", steps: [{ id: "review", title: "Review lessons", status: "proposed", module: "timetable" }], sourceIds: [], missingInformation: [] } });
  assert.equal((await beginSchoolAiRequest(admin, input)).state, "COMPLETED");
  await raw.rolePermission.create({ data: { schoolId, role: admin.role, module: "fees", canView: false, canAdd: true, canEdit: true } });
  try { await assert.rejects(() => beginSchoolAiRequest(admin, input), { status: 403 }); }
  finally { await raw.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "fees" } }); }
});

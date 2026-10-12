import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool } from "../../src/lib/school-ai/execution";
import { listAnnouncementDeliveries } from "../../src/lib/school-ai/announcements-service";
import { consume, type Database } from "../../src/lib/queue/outbox";
import { announcementDeliveryWorkflow, type AnnouncementEmailAdapter } from "../../src/lib/queue/announcement-delivery";
import type { AnnouncementProposal } from "../../src/lib/school-ai/announcements";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated PostgreSQL fixture on port 55438.");
const old = { SMTP_AUTH: process.env.SMTP_AUTH, SMTP_HOST: process.env.SMTP_HOST, EMAIL_DEV_MODE: process.env.EMAIL_DEV_MODE, DISABLE_OUTBOUND_MESSAGES: process.env.DISABLE_OUTBOUND_MESSAGES };
process.env.SMTP_AUTH = "false"; process.env.SMTP_HOST = "synthetic-never-send.invalid"; delete process.env.EMAIL_DEV_MODE; delete process.env.DISABLE_OUTBOUND_MESSAGES;
const db = new PrismaClient();
after(async () => { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } await db.$disconnect(); await prisma.$disconnect(); });
async function school(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture();
  try { await run(f); } finally { await db.school.delete({ where: { id: f.schoolId } }); }
}
async function fixture() {
  const schoolId = `announcement-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), parentId = randomUUID(), studentId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Synthetic announcement school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: userId, schoolId, campusId, fullName: "Planner", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN" }, { id: parentId, schoolId, campusId, fullName: "Guardian", email: `${parentId}@example.invalid`, role: "PARENT", preferredLanguage: "ur" }] });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026 } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic learner", rollNo: "1", gender: "OTHER" } });
  const relation = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: parentId, createdByUserId: userId, fullName: "Guardian", email: `${parentId}@example.invalid`, relationship: "GUARDIAN", status: "ACTIVE", verifiedAt: new Date(Date.now() - 3600000), validFrom: new Date(Date.now() - 3600000), accessVersions: { create: { school: { connect: { id: schoolId } }, permissions: { communication: true }, reason: "Synthetic verified right", createdByUserId: userId, effectiveFrom: new Date(Date.now() - 3600000) } } }, include: { accessVersions: true } });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid` };
  const proposal: AnnouncementProposal = { operation: "communications.queue_announcement", classIds: [classId], channel: "EMAIL", messages: { en: { subject: "School notice", body: "Exact English text <b>literal</b>" }, ur: { subject: "اسکول کی اطلاع", body: "جائزہ لیا گیا درست متن" } }, fallbackLanguage: null };
  return { schoolId, campusId, classId, user, parentId, studentId, relation, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function approved(f: Fixture, proposal = f.proposal) {
  const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", campusId: f.campusId, title: "Reviewed school notice", idempotencyKey: randomUUID(), data: { goal: "Queue reviewed guardian email", steps: [{ id: "queue", title: "Queue email", status: "ready", module: "communications" }], missingInformation: [], sourceIds: [], proposal } });
  return updateWorkspaceRecord(f.user, record.id, { action: "approve", version: record.version });
}
async function queue(f: Fixture, record: Awaited<ReturnType<typeof approved>>) {
  const preview = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  const input = { operation: "communications.queue_announcement" as const, version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  return { preview, input, receipt: await executeSchoolAiTool(f.user, record.id, input) };
}
async function runDelivery(f: Fixture, communicationId: string, adapter: AnnouncementEmailAdapter, database: Database = db) {
  const [event] = await db.$queryRaw<Array<{ eventId: string; schoolId: string }>>`SELECT id AS "eventId",school_id AS "schoolId" FROM workflow_events WHERE school_id=${f.schoolId} AND reference_id=${communicationId}`;
  assert(event);
  await consume(database, event, ctx => announcementDeliveryWorkflow(ctx, adapter));
  return event;
}

test("announcement preview binds language and verified audience; atomic queue retries never send synchronously", () => school(async f => {
  const record = await approved(f), result = await queue(f, record);
  assert.equal(result.preview.recipients[0].language, "ur"); assert.equal(result.preview.recipients[0].recipient, f.relation.email);
  assert.deepEqual(await executeSchoolAiTool(f.user, record.id, result.input), result.receipt);
  assert.equal(result.receipt.queuedCount, 1);
  const saved = await db.parentCommunication.findUniqueOrThrow({ where: { id: result.receipt.communicationIds[0] } });
  assert.equal(saved.status, "PENDING"); assert.equal(saved.sentAt, null); assert.equal(saved.body, f.proposal.messages.ur!.body);
  const jobs = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM workflow_events WHERE school_id=${f.schoolId}`;
  assert.equal(Number(jobs[0].count), 1);
  assert.equal((await listAnnouncementDeliveries(f.user, record.id, result.receipt.id)).counts.QUEUED, 1);
  const audit = await db.auditLog.findFirstOrThrow({ where: { schoolId: f.schoolId, recordId: result.receipt.id } });
  assert(!JSON.stringify(audit).includes(saved.body)); assert(!JSON.stringify(audit).includes(saved.recipient));
}));
test("siblings sharing one guardian receive one email; ambiguous contacts and missing translations block", () => school(async f => {
  const sibling = await db.student.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, fullName: "Synthetic sibling", rollNo: "2", gender: "OTHER" } });
  const siblingLink = await db.guardianRelationship.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: sibling.id, guardianUserId: f.parentId, createdByUserId: f.user.userId, fullName: "Guardian", email: f.relation.email, relationship: "GUARDIAN", status: "ACTIVE", verifiedAt: new Date(), accessVersions: { create: { school: { connect: { id: f.schoolId } }, permissions: { communication: true }, reason: "Test", createdByUserId: f.user.userId } } } });
  const record = await approved(f);
  const preview = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  assert.equal(preview.recipients.length, 1); assert.equal(preview.recipients[0].studentNames.length, 2);
  await db.guardianRelationship.update({ where: { id: siblingLink.id }, data: { email: "different@example.invalid" } });
  assert((await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version)).blockers.includes("ANNOUNCEMENT_CONTACT_CONFLICT"));
  const untranslated = await approved(f, { ...f.proposal, messages: { en: f.proposal.messages.en }, fallbackLanguage: null });
  assert((await previewSchoolAiExecution(f.user, untranslated.id, "communications.queue_announcement", untranslated.version)).blockers.includes("ANNOUNCEMENT_MISSING_LANGUAGE"));
}));
test("student exclusions are unique and do not include students with an eligible guardian", () => school(async f => {
  const secondParent = randomUUID();
  await db.user.create({ data: { id: secondParent, schoolId: f.schoolId, campusId: f.campusId, fullName: "Second guardian", email: `${secondParent}@example.invalid`, role: "PARENT", preferredLanguage: "ur" } });
  await db.guardianRelationship.create({ data: { schoolId: f.schoolId, campusId: f.campusId, studentId: f.studentId, guardianUserId: secondParent, createdByUserId: f.user.userId, fullName: "Second guardian", email: `${secondParent}@example.invalid`, relationship: "GUARDIAN", status: "ACTIVE", verifiedAt: new Date(), accessVersions: { create: { school: { connect: { id: f.schoolId } }, permissions: { communication: false }, reason: "Synthetic denied right", createdByUserId: f.user.userId } } } });
  const record = await approved(f);
  const included = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  assert.equal(included.recipients.length, 1);
  assert.deepEqual(included.skipped, []);
  await db.guardianAccessVersion.create({ data: { schoolId: f.schoolId, relationshipId: f.relation.id, permissions: { communication: false }, reason: "Synthetic revocation", createdByUserId: f.user.userId } });
  const excluded = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  assert.equal(excluded.recipients.length, 0);
  assert.deepEqual(excluded.skipped, [{ studentId: f.studentId, studentName: "Synthetic learner", reason: "NO_COMMUNICATION_PERMISSION" }]);
}));
test("changed contact or effective rights invalidates an exact reviewed audience before queue", () => school(async f => {
  const record = await approved(f), preview = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  await db.guardianRelationship.update({ where: { id: f.relation.id }, data: { email: "changed@example.invalid" } });
  await assert.rejects(() => executeSchoolAiTool(f.user, record.id, { operation: "communications.queue_announcement", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() }), { code: "STALE_EXECUTION_PREVIEW" });
  await db.guardianAccessVersion.create({ data: { schoolId: f.schoolId, relationshipId: f.relation.id, permissions: { communication: false }, reason: "Revoked", createdByUserId: f.user.userId } });
  const current = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  assert(current.skipped.some(item => item.reason === "NO_COMMUNICATION_PERMISSION")); assert.equal(current.recipients.length, 0);
  assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("concurrent approved queue requests create one communication, event and receipt", () => school(async f => {
  const record = await approved(f), preview = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
  const results = await Promise.all([1, 2, 3].map(() => executeSchoolAiTool(f.user, record.id, { operation: "communications.queue_announcement", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() })));
  assert.equal(new Set(results.map(item => item.id)).size, 1); assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 1);
}));
test("delivery adapter receives exact approved plain text once and reports accepted, never delivered without receipt", () => school(async f => {
  const record = await approved(f), result = await queue(f, record); let sent = 0;
  const adapter: AnnouncementEmailAdapter = async message => { sent++; assert.equal(message.body, f.proposal.messages.ur!.body); assert.equal(message.language, "ur"); return { success: true, messageId: "synthetic-provider-id" }; };
  await Promise.all([runDelivery(f, result.receipt.communicationIds[0], adapter), runDelivery(f, result.receipt.communicationIds[0], adapter)]);
  assert.equal(sent, 1);
  const progress = await listAnnouncementDeliveries(f.user, record.id, result.receipt.id);
  assert.equal(progress.counts.ACCEPTED, 1); assert.equal(progress.counts.DELIVERED, 0);
  await db.deliveryReceipt.create({ data: { id: randomUUID(), schoolId: f.schoolId, communicationId: result.receipt.communicationIds[0], providerMessageId: "synthetic-provider-id", state: "delivered", occurredAt: new Date() } });
  assert.equal((await listAnnouncementDeliveries(f.user, record.id, result.receipt.id)).counts.DELIVERED, 1);
}));
test("editing approval, revoking guardian rights, changing language/contact or disabling actor stops queued delivery", async () => {
  for (const change of ["approval", "rights", "language", "contact", "actor", "class", "grants"] as const) await school(async f => {
    const record = await approved(f), result = await queue(f, record); let sent = 0;
    if (change === "approval") await updateWorkspaceRecord(f.user, record.id, { action: "save", version: record.version, title: "Revised review required" });
    if (change === "rights") await db.guardianAccessVersion.create({ data: { schoolId: f.schoolId, relationshipId: f.relation.id, permissions: { communication: false }, reason: "Revoked", createdByUserId: f.user.userId } });
    if (change === "language") await db.user.update({ where: { id: f.parentId }, data: { preferredLanguage: "en" } });
    if (change === "contact") await db.guardianRelationship.update({ where: { id: f.relation.id }, data: { email: "changed@example.invalid" } });
    if (change === "actor") await db.user.update({ where: { id: f.user.userId }, data: { isActive: false } });
    if (change === "class") await db.class.update({ where: { id: f.classId }, data: { archivedAt: new Date() } });
    if (change === "grants") await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "students", canView: true, canAdd: true, canEdit: false, canDelete: false } });
    await runDelivery(f, result.receipt.communicationIds[0], async () => { sent++; return { success: true, messageId: "must-not-send" }; });
    assert.equal(sent, 0, change);
    assert.equal((await db.parentCommunication.findUniqueOrThrow({ where: { id: result.receipt.communicationIds[0] } })).status, "BLOCKED", change);
  });
});
test("unknown provider outcomes are fenced and never retried automatically", () => school(async f => {
  const record = await approved(f), result = await queue(f, record); let sent = 0;
  const adapter: AnnouncementEmailAdapter = async () => { sent++; throw new Error("Synthetic timeout after possible provider acceptance"); };
  await runDelivery(f, result.receipt.communicationIds[0], adapter); await runDelivery(f, result.receipt.communicationIds[0], adapter);
  assert.equal(sent, 1);
  assert.equal((await listAnnouncementDeliveries(f.user, record.id, result.receipt.id)).counts.UNCERTAIN, 1);
}));
test("worker rights timestamps remain UTC in a non-UTC database session", () => school(async f => {
  const record = await approved(f), result = await queue(f, record); let sent = 0;
  // Current grant expires shortly in UTC; a future denial must not take effect
  // early under Asia/Karachi's +05 session zone.
  await db.guardianAccessVersion.update({ where: { id: f.relation.accessVersions[0].id }, data: { effectiveUntil: new Date(Date.now() + 3600000) } });
  await db.guardianAccessVersion.create({ data: { schoolId: f.schoolId, relationshipId: f.relation.id, permissions: { communication: false }, reason: "Future scheduled denial", createdByUserId: f.user.userId, effectiveFrom: new Date(Date.now() + 1800000) } });
  const nonUtc: Database = { $queryRaw: db.$queryRaw.bind(db), $executeRaw: db.$executeRaw.bind(db), $transaction: fn => db.$transaction(async tx => { await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Karachi'`; return fn(tx); }) };
  await runDelivery(f, result.receipt.communicationIds[0], async () => { sent++; return { success: true, messageId: "timezone-safe" }; }, nonUtc);
  assert.equal(sent, 1);
}));
test("provider disabled and cross-campus scopes cannot queue, and channel permission revocations are fresh", () => school(async f => {
  const record = await approved(f);
  process.env.DISABLE_OUTBOUND_MESSAGES = "true";
  try {
    const preview = await previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version);
    assert(preview.blockers.includes("ANNOUNCEMENT_PROVIDER_UNAVAILABLE"));
    await assert.rejects(() => executeSchoolAiTool(f.user, record.id, { operation: "communications.queue_announcement", version: record.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() }), { code: "ANNOUNCEMENT_PROVIDER_UNAVAILABLE" });
  } finally { delete process.env.DISABLE_OUTBOUND_MESSAGES; }
  await assert.rejects(() => previewSchoolAiExecution({ ...f.user, campusId: "foreign" }, record.id, "communications.queue_announcement", record.version), { status: 404 });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "students", canView: true, canAdd: true, canEdit: false, canDelete: false } });
  await assert.rejects(() => previewSchoolAiExecution(f.user, record.id, "communications.queue_announcement", record.version), { status: 403 });
  assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0);
}));

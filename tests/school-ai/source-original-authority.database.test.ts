import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { assertSourceOriginalAccess, createWorkspaceRecord, getWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createDocumentJob, listDocumentJobs, processDocumentJob, updateDocumentJob } from "../../src/lib/school-ai/document-jobs-service";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { saveOriginal, readOriginal, removeOriginal } from "../../src/lib/school-ai/source-storage";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Isolated PG55438 only.");
process.env.SCHOOL_AI_STORAGE_DIR = "/private/tmp/skoolee-ai-source-authority-tests";
const db = new PrismaClient(), schoolId = `ai-source-auth-${randomUUID()}`, campusId = randomUUID();
const admin: AuthUser = { userId: randomUUID(), schoolId, campusId, role: "CAMPUS_ADMIN", email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
const teacher: AuthUser = { ...admin, userId: randomUUID(), role: "TEACHER", email: `${randomUUID()}@example.invalid` }, keys: string[] = [];
const extracted = { text: "Restricted original financial amounts.", pages: [], uncertainties: [], model: "native-utf8", tokensUsed: 0 };
const adapters = { read: readOriginal, remove: removeOriginal, extract: async () => extracted };
before(async () => {
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic source authority", contactEmail: admin.email, city: "Test", status: "ACTIVE" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  for (const user of [admin, teacher]) await db.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: "Synthetic reviewer", onboardingComplete: true } });
});
after(async () => { for (const key of keys) await removeOriginal(key); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function source(documentKind: "fee_sheet" | "syllabus" = "fee_sheet", scope: { subjectId: string; classId: string } | object = {}) {
  const storageKey = await saveOriginal(schoolId, Buffer.from(extracted.text), "text/plain"); keys.push(storageKey);
  return createWorkspaceRecord(admin, { kind: "SOURCE", title: "Synthetic restricted source", campusId, idempotencyKey: randomUUID(), data: { documentKind, extractedText: extracted.text, fileName: "synthetic.txt", mimeType: "text/plain", origin: "upload", extractionStatus: "needs_review", ...scope } }, { trustedSourceMetadata: { storageKey, sourceLanguage: "en" } });
}
const denyFees = () => db.rolePermission.create({ data: { schoolId, role: admin.role, module: "fees", canView: false, canAdd: false, canEdit: false, canDelete: false } });
const restoreFees = () => db.rolePermission.deleteMany({ where: { schoolId, role: admin.role, module: "fees" } });
const originalAccess = (user: AuthUser, id: string, version?: number) => schoolAiTransaction(user, tx => assertSourceOriginalAccess(user, id, tx, { version }));
async function reclassify(record: Awaited<ReturnType<typeof source>>) { return updateWorkspaceRecord(admin, record.id, { version: record.version, data: { ...record.data, documentKind: "other", extractedText: "Current public correction." } }); }

test("old OCR and retained originals remain restricted after fee-sheet reclassification and permission revocation", async () => {
  let readySource = await source(), pendingSource = await source(), failedSource = await source(), retentionSource = await source();
  const readyJob = await createDocumentJob(admin, readySource.id, { version: readySource.version, kind: "EXTRACT" });
  const ready = (await processDocumentJob(admin, readyJob.id, adapters))!;
  const queued = await createDocumentJob(admin, pendingSource.id, { version: pendingSource.version, kind: "EXTRACT" });
  const failedJob = await createDocumentJob(admin, failedSource.id, { version: failedSource.version, kind: "EXTRACT" });
  await assert.rejects(() => processDocumentJob(admin, failedJob.id, { ...adapters, extract: async () => { throw new Error("Synthetic failure"); } }));
  const failed = (await listDocumentJobs(admin, failedSource.id))[0];
  readySource = await reclassify(readySource); pendingSource = await reclassify(pendingSource); failedSource = await reclassify(failedSource); retentionSource = await reclassify(retentionSource);
  retentionSource = await updateWorkspaceRecord(admin, retentionSource.id, { version: retentionSource.version, action: "archive" });
  const deletion = await createDocumentJob(admin, retentionSource.id, { version: retentionSource.version, kind: "DELETE_ORIGINAL" });
  await db.schoolAiDocumentJob.update({ where: { id: deletion.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
  assert.equal((await listDocumentJobs(admin, readySource.id))[0].result?.text, extracted.text);
  await originalAccess(admin, readySource.id, readyJob.recordVersion);
  await denyFees(); let io = 0;
  try {
    assert.equal((await getWorkspaceRecord(admin, readySource.id)).data.extractedText, "Current public correction.");
    await assert.rejects(() => listDocumentJobs(admin, readySource.id), { status: 403 });
    await assert.rejects(() => originalAccess(admin, readySource.id), { status: 403 });
    await assert.rejects(() => updateDocumentJob(admin, readySource.id, ready.id, { action: "apply", version: ready.version, recordVersion: readySource.version }), { status: 403 });
    await assert.rejects(() => updateDocumentJob(admin, failedSource.id, failed.id, { action: "retry", version: failed.version }), { status: 403 });
    await assert.rejects(() => updateDocumentJob(admin, pendingSource.id, queued.id, { action: "cancel", version: queued.version }), { status: 403 });
    for (const [record, kind] of [[readySource, "EXTRACT"], [retentionSource, "DELETE_ORIGINAL"]] as const) await assert.rejects(() => createDocumentJob(admin, record.id, { version: record.version, kind }), { status: 403 });
    const forbiddenIo = { ...adapters, read: async () => { io++; return Buffer.from("Never read"); }, remove: async () => { io++; } };
    await assert.rejects(() => processDocumentJob(admin, queued.id, forbiddenIo), { status: 403 });
    await assert.rejects(() => processDocumentJob(admin, deletion.id, forbiddenIo), { status: 403 });
    assert.equal(io, 0);
    assert.equal((await readOriginal(retentionSource.data.storageKey as string)).toString(), extracted.text);
  } finally { await restoreFees(); }
  assert.equal((await listDocumentJobs(admin, readySource.id))[0].result?.text, extracted.text);
  await originalAccess(admin, readySource.id, readyJob.recordVersion);
});

test("reviewed apply cannot launder restricted OCR into a broader category, including extraction queued after reclassification", async () => {
  let record = await source(); record = await reclassify(record);
  const job = await createDocumentJob(admin, record.id, { version: record.version, kind: "EXTRACT" }), ready = (await processDocumentJob(admin, job.id, adapters))!;
  await assert.rejects(() => updateDocumentJob(admin, record.id, job.id, { action: "apply", version: ready.version, recordVersion: record.version }), { status: 409, code: "SOURCE_CLASSIFICATION_CHANGED" });
  assert.equal((await getWorkspaceRecord(admin, record.id)).data.extractedText, "Current public correction.");
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, data: { ...record.data, documentKind: "fee_sheet" } });
  const applied = await updateDocumentJob(admin, record.id, job.id, { action: "apply", version: ready.version, recordVersion: record.version });
  assert.equal(applied.job.status, "APPLIED"); assert.equal(applied.record?.data.extractedText, extracted.text);
});

test("jobs require their exact immutable source version rather than any current readable revision", async () => {
  const record = await source(), job = await createDocumentJob(admin, record.id, { version: record.version, kind: "EXTRACT" });
  await db.schoolAiDocumentJob.update({ where: { id: job.id }, data: { recordVersion: 9000 } });
  await assert.rejects(() => listDocumentJobs(admin, record.id), { status: 403, code: "SOURCE_HISTORY_UNAVAILABLE" });
  await assert.rejects(() => processDocumentJob(admin, job.id, adapters), { status: 403, code: "SOURCE_HISTORY_UNAVAILABLE" });
  await assert.rejects(() => updateDocumentJob(admin, record.id, job.id, { action: "cancel", version: job.version }), { status: 403, code: "SOURCE_HISTORY_UNAVAILABLE" });
  assert.equal((await db.schoolAiDocumentJob.findUniqueOrThrow({ where: { id: job.id } })).attempts, 0);
});

test("current teaching access cannot expose original bytes or OCR from a revoked historical subject", async () => {
  const classId = randomUUID(); await db.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic class", academicYear: 2026, teachingMode: "SUBJECT" } });
  const oldSubject = await db.subject.create({ data: { schoolId, campusId, classId, name: "Original subject", teacherId: teacher.userId } }), currentSubject = await db.subject.create({ data: { schoolId, campusId, classId, name: "Current subject", teacherId: teacher.userId } });
  let record = await source("syllabus", { subjectId: oldSubject.id, classId }); const job = await createDocumentJob(admin, record.id, { version: record.version, kind: "EXTRACT" });
  await processDocumentJob(admin, job.id, adapters);
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, data: { ...record.data, subjectId: currentSubject.id, extractedText: "Current subject correction.", uncertainties: [], extractionStatus: "extracted" } });
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" });
  await originalAccess(teacher, record.id, job.recordVersion); assert.equal((await listDocumentJobs(teacher, record.id)).length, 1);
  await db.subject.update({ where: { id: oldSubject.id }, data: { teacherId: null } });
  assert.equal((await getWorkspaceRecord(teacher, record.id)).data.subjectId, currentSubject.id);
  await assert.rejects(() => originalAccess(teacher, record.id, job.recordVersion), { status: 403 });
  await assert.rejects(() => listDocumentJobs(teacher, record.id), { status: 403 });
});

test("permission loss during extraction prevents persistence of its OCR result", async () => {
  let record = await source(); record = await reclassify(record);
  const job = await createDocumentJob(admin, record.id, { version: record.version, kind: "EXTRACT" });
  try {
    await assert.rejects(() => processDocumentJob(admin, job.id, { ...adapters, extract: async () => { await denyFees(); return extracted; } }), { status: 403 });
    const saved = await db.schoolAiDocumentJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(saved.status, "FAILED"); assert.equal(saved.result, null); assert.equal(saved.appliedVersion, null);
  } finally { await restoreFees(); }
});

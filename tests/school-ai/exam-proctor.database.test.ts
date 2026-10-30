import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { getExamProctor, startExamProctor, uploadExamProctorClip, changeExamProctor, readExamProctorClip, purgeExpiredExamProctor, updateExamProctorPolicy } from "../../src/lib/school-ai/exam-proctor-service";
import { PROCTOR_CONSENT_VERSION, PROCTOR_STREAM_BYTES, ProctorPolicySchema, isProctorVideo } from "../../src/lib/school-ai/exam-proctor";
import { saveSchoolAiAttempt } from "../../src/lib/school-ai/exam-service";
import { examProctorFixture, removeProctorFixture, proctorContext as ctx, type ProctorFixture } from "./exam-proctor-fixture";
import { sweepExamProctorRecordings } from "../../src/lib/school-ai/exam-proctor-sweep";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(); let root = ""; before(async () => { root = await mkdtemp(join(tmpdir(), "proctor-db-")); process.env.SCHOOL_AI_STORAGE_DIR = root; });
const schools: string[] = []; after(async () => { for (const schoolId of schools) await removeProctorFixture(db, schoolId); await rm(root, { recursive: true, force: true }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture(options = {}) { const f = await examProctorFixture(db, options); schools.push(f.schoolId); return f; }
const consent = (f: ProctorFixture, kind = "CAMERA") => ({ attemptId: f.attempt!.id, kind, clientKey: randomUUID(), consentVersion: PROCTOR_CONSENT_VERSION, consent: true });
const video = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 1]);
async function capture(f: ProctorFixture) { const session = await ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, consent(f))), clip = await ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, video, "video/webm;codecs=vp8")); return { session, clip }; }
test("consent and policies are explicit, bounded, frozen once attempts start", async () => {
  assert.equal(ProctorPolicySchema.safeParse({ enabled: true, camera: false, screen: false, retentionDays: 1 }).success, false); assert.equal(ProctorPolicySchema.safeParse({ enabled: true, camera: true, screen: false, retentionDays: 8 }).success, false); assert.equal(isProctorVideo(Buffer.from("<html>"), "video/webm"), false);
  const f = await fixture(); await assert.rejects(() => ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, { ...consent(f), consent: false }))); await assert.rejects(() => ctx(f.admin, () => updateExamProctorPolicy(f.admin, f.assignment.id, { version: 2, policy: { enabled: false } })), { status: 409 });
  const disabled = await fixture({ enabled: false }); await assert.rejects(() => ctx(disabled.learner, () => startExamProctor(disabled.learner, disabled.assignment.id, consent(disabled))), { status: 403 });
});
test("one opt-in session and exact clip retries preserve private media and never alter answers", async () => {
  const f = await fixture(), input = consent(f), before = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } });
  const session = await ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, input)); assert.equal((await ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, input))).id, session.id);
  const clip = await ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, video, "video/webm")); assert.equal((await ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, video, "video/webm"))).id, clip.id);
  await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, Buffer.concat([video, Buffer.from([1])]), "video/webm")), { status: 409 });
  assert.deepEqual((await ctx(f.admin, () => readExamProctorClip(f.admin, f.assignment.id, clip.id))).bytes, video);
  const publicView = await ctx(f.learner, () => getExamProctor(f.learner, f.assignment.id)); for (const secret of ["storageKey", "checksum", "paperSnapshot", "correctOptionId", "modelAnswer", "scoreProposal"]) assert.equal(JSON.stringify(publicView).includes(secret), false);
  const after = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } }); assert.deepEqual(after.responses, before.responses); assert.equal(after.sequence, before.sequence); assert.equal(after.review, before.review); assert.equal(await db.mark.count({ where: { schoolId: f.schoolId } }), 0);
});
test("other pupils, unrelated teachers, campus changes and revoked current grants cannot read or review clips", async () => {
  const f = await fixture(), { session, clip } = await capture(f);
  for (const user of [f.other, f.teacher]) await assert.rejects(() => ctx(user, () => readExamProctorClip(user, f.assignment.id, clip.id)), { status: 404 });
  await assert.rejects(() => ctx(f.learner, () => changeExamProctor(f.learner, f.assignment.id, { action: "review", sessionId: session.id, note: "self review" })), { status: 403 });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "ADMIN", module: "exams", canView: false } }); await assert.rejects(() => ctx(f.admin, () => readExamProctorClip(f.admin, f.assignment.id, clip.id)), { status: 403 });
  await db.user.update({ where: { id: f.learner.userId }, data: { accessVersion: 1 } }); await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 1, video, "video/webm")), { status: 403 });
});
test("deleting consent hides clips immediately and retention durably removes private objects and notes", async () => {
  const f = await fixture(), { session, clip } = await capture(f), row = await db.schoolAiProctorClip.findUniqueOrThrow({ where: { id: clip.id } });
  await ctx(f.admin, () => changeExamProctor(f.admin, f.assignment.id, { action: "review", sessionId: session.id, note: "Reviewed by an authorized human; no mark change." })); await ctx(f.learner, () => changeExamProctor(f.learner, f.assignment.id, { action: "delete", sessionId: session.id })); await assert.rejects(() => ctx(f.admin, () => readExamProctorClip(f.admin, f.assignment.id, clip.id)), { status: 410 });
  await ctx(f.admin, () => purgeExpiredExamProctor(f.schoolId)); await assert.rejects(() => readFile(join(root, row.storageKey)), { code: "ENOENT" }); const deleted = await db.schoolAiProctorSession.findUniqueOrThrow({ where: { id: session.id } }); assert.equal(deleted.status, "DELETED"); assert.equal(deleted.reviewNote, null); assert.equal((await ctx(f.admin, () => purgeExpiredExamProctor(f.schoolId))).deleted, 0);
});
test("expiry denies media before a worker run; interrupted uploads are eventually removed", async () => {
  const f = await fixture(), { session, clip } = await capture(f); await db.schoolAiProctorSession.update({ where: { id: session.id }, data: { retentionUntil: new Date(Date.now() - 1000) } }); await assert.rejects(() => ctx(f.learner, () => readExamProctorClip(f.learner, f.assignment.id, clip.id)), { status: 410 }); await ctx(f.admin, () => purgeExpiredExamProctor(f.schoolId)); assert.equal((await db.schoolAiProctorClip.findUniqueOrThrow({ where: { id: clip.id } })).status, "DELETED");
  const next = await ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, consent(f))); const reservation = await db.schoolAiProctorClip.create({ data: { schoolId: f.schoolId, campusId: f.campusId, sessionId: next.id, sequence: 0, storageKey: `school-ai/${f.schoolId}/${randomUUID()}`, checksum: "test", mimeType: "video/webm", bytes: 8, createdAt: new Date(Date.now() - 600000) } }); await ctx(f.admin, () => purgeExpiredExamProctor(f.schoolId)); assert.equal((await db.schoolAiProctorClip.findUniqueOrThrow({ where: { id: reservation.id } })).status, "DELETED");
});
test("server enforces byte, sequence, ownership, restart and submitted attempt limits", async () => {
  const f = await fixture(), { session } = await capture(f); await assert.rejects(() => ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, consent(f))), { status: 409 }); await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 3, video, "video/webm")), { status: 409 });
  await db.schoolAiProctorSession.update({ where: { id: session.id }, data: { bytes: PROCTOR_STREAM_BYTES } }); await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 1, video, "video/webm")), { status: 409 });
  await ctx(f.learner, () => saveSchoolAiAttempt(f.learner, f.assignment.id, { sequence: 1, responses: { q1: "a1" }, submit: true })); await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 1, video, "video/webm")), { status: 409 }); assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } })).responses && (await ctx(f.learner, () => getExamProctor(f.learner, f.assignment.id))).sessions[0].status, "ENDED");
});
test("deletion sweep obeys a global object budget and resumes unfinished sessions in tenant context", async () => {
  const f = await fixture(), { session } = await capture(f); await ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 1, video, "video/webm")); await ctx(f.learner, () => changeExamProctor(f.learner, f.assignment.id, { action: "delete", sessionId: session.id }));
  assert.equal((await ctx(f.admin, () => purgeExpiredExamProctor(f.schoolId, 1))).deleted, 1); assert.equal((await db.schoolAiProctorSession.findUniqueOrThrow({ where: { id: session.id } })).status, "DELETING");
  const result = await sweepExamProctorRecordings(db); assert.equal(result.failed, 0); assert.equal((await db.schoolAiProctorSession.findUniqueOrThrow({ where: { id: session.id } })).status, "DELETED"); assert.equal(await db.schoolAiProctorClip.count({ where: { schoolId: f.schoolId, status: { not: "DELETED" } } }), 0);
});
test("simultaneous tabs create one active stream and conflicting clip sequences never overwrite evidence", async () => {
  const f = await fixture(), outcomes = await Promise.allSettled([ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, consent(f))), ctx(f.learner, () => startExamProctor(f.learner, f.assignment.id, consent(f)))]); assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1); const session = await db.schoolAiProctorSession.findFirstOrThrow({ where: { schoolId: f.schoolId, status: "ACTIVE" } });
  const clips = await Promise.allSettled([ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, video, "video/webm")), ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 0, Buffer.concat([video, Buffer.from([2])]), "video/webm"))]); assert.equal(clips.filter(outcome => outcome.status === "fulfilled").length, 1); assert.equal(await db.schoolAiProctorClip.count({ where: { schoolId: f.schoolId } }), 1); assert.equal((await db.schoolAiProctorSession.findUniqueOrThrow({ where: { id: session.id } })).clipCount, 1);
});
test("removing exam membership immediately denies media reads while preserving the candidate's deletion right", async () => {
  const f = await fixture(), { session, clip } = await capture(f); await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { studentIds: [f.students[1].id] } }); await assert.rejects(() => ctx(f.learner, () => readExamProctorClip(f.learner, f.assignment.id, clip.id)), { status: 404 }); await assert.rejects(() => ctx(f.learner, () => uploadExamProctorClip(f.learner, f.assignment.id, session.id, 1, video, "video/webm")), { status: 404 }); await ctx(f.learner, () => changeExamProctor(f.learner, f.assignment.id, { action: "delete", sessionId: session.id })); assert.equal((await db.schoolAiProctorSession.findUniqueOrThrow({ where: { id: session.id } })).status, "DELETING");
});

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { schoolAiTransaction } from "./transaction";
import { readOriginal, removeOriginal, saveReservedOriginal, sourceStorageAvailable } from "./source-storage";
import { isProctorVideo, PROCTOR_CLIP_BYTES, PROCTOR_STREAM_BYTES, PROCTOR_STREAM_CLIPS, ProctorChangeSchema, ProctorPolicyUpdateSchema, ProctorStartSchema, proctorMimeType, proctorPolicy, type ProctorView } from "./exam-proctor";
import { examIntegrityPolicy } from "./exam-integrity";

async function actor(user: AuthUser, db: TxClient) {
  const current = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId, role: user.role, isActive: true }, select: { accessVersion: true } });
  if (!current || user.accessVersion !== undefined && current.accessVersion !== user.accessVersion) throw new ApiError("Your exam access changed. Sign in again.", 403);
}
async function audit(db: TxClient, user: AuthUser, campusId: string, id: string, action: string, detail: Prisma.InputJsonObject = {}) { await db.auditLog.create({ data: { schoolId: user.schoolId, campusId, tableName: "school_ai_proctor_sessions", recordId: id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { action, ...detail } } }); }
async function sessionAccess(user: AuthUser, assignmentId: string, sessionId: string, db: TxClient, action: "view" | "edit" = "view") {
  await actor(user, db);
  const session = await db.schoolAiProctorSession.findFirst({ where: { id: sessionId, assignmentId, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) }, include: { assignment: true, attempt: true } });
  if (!session) throw new ApiError("Recording unavailable.", 404);
  if (user.role === "STUDENT") { if (session.userId !== user.userId || session.attempt.userId !== user.userId) throw new ApiError("Recording unavailable.", 404); if (action === "view") await scopedAssignment(user, assignmentId, db); }
  // Recording content is protected evidence. Room duty permits signals, never capture bytes.
  else await staffExamAccess(user, session.assignment, action, db);
  return session;
}
function readable(session: { status: string; retentionUntil: Date }) { return !["DELETING", "DELETED", "REVOKED"].includes(session.status) && session.retentionUntil.getTime() > Date.now(); }
async function activeSession(user: AuthUser, assignmentId: string, id: string, db: TxClient) {
  const session = await sessionAccess(user, assignmentId, id, db);
  if (user.role !== "STUDENT" || session.status !== "ACTIVE" || !readable(session) || session.attempt.status !== "IN_PROGRESS" || session.attempt.deadlineAt <= new Date()) throw new ApiError("Recording has ended. Your exam answers are unaffected.", 409);
  await scopedAssignment(user, assignmentId, db);
  return session;
}
export async function getExamProctor(user: AuthUser, assignmentId: string, cursor?: string): Promise<ProctorView> {
  await actor(user, prisma); const { assignment } = await scopedAssignment(user, assignmentId, prisma, "SUPERVISION");
  const anchor = cursor ? await prisma.schoolAiProctorSession.findFirst({ where: { id: cursor, schoolId: user.schoolId, assignmentId, ...(user.role === "STUDENT" ? { userId: user.userId } : {}) }, select: { id: true, consentedAt: true } }) : null;
  if (cursor && !anchor) throw new ApiError("Recording page unavailable.", 404);
  const page = await prisma.schoolAiProctorSession.findMany({ where: { schoolId: user.schoolId, assignmentId, ...(user.role === "STUDENT" ? { userId: user.userId } : {}), ...(anchor ? { OR: [{ consentedAt: { lt: anchor.consentedAt } }, { consentedAt: anchor.consentedAt, id: { lt: anchor.id } }] } : {}) }, include: { clips: { where: { status: "READY" }, orderBy: { sequence: "asc" }, select: { id: true, sequence: true, createdAt: true, bytes: true } }, attempt: { select: { studentId: true, status: true, deadlineAt: true } } }, orderBy: [{ consentedAt: "desc" }, { id: "desc" }], take: 51 });
  const sessions = page.slice(0, 50);
  const students = user.role === "STUDENT" ? [] : await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: sessions.map(s => s.attempt.studentId) } }, select: { id: true, fullName: true, rollNo: true } });
  let canReadCapture = user.role === "STUDENT";
  if (!canReadCapture) {
    try { await staffExamAccess(user, assignment, "view"); canReadCapture = true; }
    catch (error) { const status = error instanceof Error && "status" in error ? error.status : null; if (status !== 403 && status !== 404) throw error; }
  }
  let canConfigure = false;
  if (user.role !== "STUDENT" && !await prisma.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId } })) {
    try { await staffExamAccess(user, assignment, "edit"); canConfigure = true; }
    catch (error) { const status = error instanceof Error && "status" in error ? error.status : null; if (status !== 403 && status !== 404) throw error; }
  }
  return { policy: proctorPolicy(assignment.proctorPolicy), version: assignment.version, canConfigure, storageAvailable: sourceStorageAvailable(), nextCursor: page.length > 50 ? sessions[49].id : null, sessions: sessions.map(s => ({ id: s.id, attemptId: s.attemptId, userId: s.userId, kind: s.kind, status: !readable(s) ? s.status === "DELETED" ? "DELETED" : "EXPIRED" : s.status === "ACTIVE" && (s.attempt.status !== "IN_PROGRESS" || s.attempt.deadlineAt <= new Date()) ? "ENDED" : s.status, consentedAt: s.consentedAt.toISOString(), retentionUntil: s.retentionUntil.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, bytes: s.bytes, clipCount: s.clipCount, reviewNote: canReadCapture && readable(s) ? s.reviewNote : null, reviewedAt: canReadCapture && readable(s) ? s.reviewedAt?.toISOString() ?? null : null, student: students.find(p => p.id === s.attempt.studentId) ?? null, clips: canReadCapture && readable(s) ? s.clips.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })) : [] })) };
}
export async function updateExamProctorPolicy(user: AuthUser, assignmentId: string, value: unknown) {
  const input = ProctorPolicyUpdateSchema.parse(value);
  if (input.policy.enabled && !sourceStorageAvailable()) throw new ApiError("Private recording storage is not configured.", 503);
  return schoolAiTransaction(user, async db => {
    const { assignment } = await scopedAssignment(user, assignmentId, db); await staffExamAccess(user, assignment, "edit", db);
    if (await db.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId } })) throw new ApiError("Recording choices are frozen after the first attempt starts.", 409);
    // Recording settings cannot enable, extend or erase the separate
    // administrator-approved observation policy, including through a forged body.
    const policy = { ...input.policy, integrity: examIntegrityPolicy(assignment.proctorPolicy) };
    const saved = await db.schoolAiExamAssignment.updateMany({ where: { id: assignmentId, schoolId: user.schoolId, version: input.version }, data: { proctorPolicy: policy, version: { increment: 1 } } });
    if (!saved.count) throw new ApiError("Exam settings changed. Refresh before saving.", 409);
    await audit(db, user, assignment.campusId, assignmentId, "POLICY", policy); return { policy, version: input.version + 1 };
  });
}
export async function startExamProctor(user: AuthUser, assignmentId: string, value: unknown) {
  const input = ProctorStartSchema.parse(value);
  if (!sourceStorageAvailable()) throw new ApiError("Private recording storage is unavailable.", 503);
  return schoolAiTransaction(user, async db => {
    await actor(user, db); const { assignment, student } = await scopedAssignment(user, assignmentId, db), policy = proctorPolicy(assignment.proctorPolicy);
    if (!student || !policy.enabled || !(input.kind === "CAMERA" ? policy.camera : policy.screen)) throw new ApiError("Optional recording is not enabled for this exam.", 403);
    const attempt = await db.schoolAiExamAttempt.findFirst({ where: { id: input.attemptId, assignmentId, schoolId: user.schoolId, userId: user.userId, studentId: student.id } });
    if (!attempt || attempt.status !== "IN_PROGRESS" || attempt.deadlineAt <= new Date()) throw new ApiError("Start the exam before choosing optional recording.", 409);
    // Fence simultaneous tabs/restarts. Never touch answer sequence or responses.
    await db.schoolAiExamAttempt.update({ where: { id: attempt.id }, data: { updatedAt: attempt.updatedAt } });
    const existing = await db.schoolAiProctorSession.findFirst({ where: { attemptId: attempt.id, kind: input.kind, clientKey: input.clientKey, schoolId: user.schoolId } });
    if (existing) { if (existing.status !== "ACTIVE") throw new ApiError("This recording session has ended.", 409); return { id: existing.id, retentionUntil: existing.retentionUntil.toISOString() }; }
    const previous = await db.schoolAiProctorSession.findMany({ where: { schoolId: user.schoolId, attemptId: attempt.id, kind: input.kind } });
    if (previous.some(s => s.status === "ACTIVE") || previous.length >= 4 || previous.reduce((sum, s) => sum + s.bytes, 0) >= PROCTOR_STREAM_BYTES || previous.reduce((sum, s) => sum + s.clipCount, 0) >= PROCTOR_STREAM_CLIPS) throw new ApiError("End the existing recording first, or continue the exam without recording when its limit is reached.", 409);
    const session = await db.schoolAiProctorSession.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, userId: user.userId, kind: input.kind, clientKey: input.clientKey, consentVersion: input.consentVersion, retentionUntil: new Date(Date.now() + policy.retentionDays * 86400000) } });
    await audit(db, user, session.campusId, session.id, "CONSENT", { kind: input.kind, consentVersion: input.consentVersion, retentionUntil: session.retentionUntil.toISOString() }); return { id: session.id, retentionUntil: session.retentionUntil.toISOString() };
  });
}
export async function uploadExamProctorClip(user: AuthUser, assignmentId: string, sessionId: string, sequence: number, bytes: Buffer, contentType: string) {
  const mimeType = proctorMimeType(contentType);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence >= PROCTOR_STREAM_CLIPS || !bytes.length || bytes.length > PROCTOR_CLIP_BYTES || !mimeType || !isProctorVideo(bytes, mimeType)) throw new ApiError("The recording clip is invalid or too large.", 400);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const reserved = await schoolAiTransaction(user, async db => {
    const session = await activeSession(user, assignmentId, sessionId, db);
    await db.schoolAiProctorSession.update({ where: { id: session.id }, data: { status: "ACTIVE" } });
    const existing = await db.schoolAiProctorClip.findFirst({ where: { schoolId: user.schoolId, sessionId, sequence } });
    if (existing) { if (existing.checksum !== checksum || existing.mimeType !== mimeType || existing.bytes !== bytes.length) throw new ApiError("A different clip already uses this sequence.", 409); if (existing.status === "READY") return { clip: existing, replay: true }; throw new ApiError("This clip upload is already pending. Refresh recording status.", 409); }
    const totals = await db.schoolAiProctorSession.aggregate({ where: { schoolId: user.schoolId, attemptId: session.attemptId, kind: session.kind }, _sum: { bytes: true, clipCount: true } });
    if ((totals._sum.bytes ?? 0) + bytes.length > PROCTOR_STREAM_BYTES || (totals._sum.clipCount ?? 0) >= PROCTOR_STREAM_CLIPS || sequence !== session.clipCount) throw new ApiError("Recording limit or sequence reached. Continue the exam without recording.", 409);
    const clip = await db.schoolAiProctorClip.create({ data: { schoolId: user.schoolId, campusId: session.campusId, sessionId, sequence, storageKey: `school-ai/${user.schoolId}/${randomUUID()}`, checksum, mimeType, bytes: bytes.length } });
    await db.schoolAiProctorSession.update({ where: { id: sessionId }, data: { bytes: { increment: bytes.length }, clipCount: { increment: 1 } } }); return { clip, replay: false };
  });
  if (reserved.replay) return { id: reserved.clip.id, sequence, replay: true };
  try {
    await saveReservedOriginal(reserved.clip.storageKey, bytes, mimeType);
    await schoolAiTransaction(user, async db => { await activeSession(user, assignmentId, sessionId, db); const changed = await db.schoolAiProctorClip.updateMany({ where: { id: reserved.clip.id, schoolId: user.schoolId, status: "PENDING" }, data: { status: "READY" } }); if (!changed.count) throw new ApiError("The recording was withdrawn before this clip finished.", 409); });
    return { id: reserved.clip.id, sequence, replay: false };
  } catch (error) {
    // Reservation remains durable if storage deletion fails; the worker retries it.
    try { await removeOriginal(reserved.clip.storageKey); await prisma.schoolAiProctorClip.updateMany({ where: { schoolId: user.schoolId, id: reserved.clip.id }, data: { status: "DELETED", deletedAt: new Date() } }); } catch { /* durable retention sweep */ }
    throw error;
  }
}
export async function changeExamProctor(user: AuthUser, assignmentId: string, value: unknown) {
  const input = ProctorChangeSchema.parse(value);
  return schoolAiTransaction(user, async db => {
    const session = await sessionAccess(user, assignmentId, input.sessionId, db, "edit");
    if (input.action === "review") {
      if (user.role === "STUDENT" || !readable(session)) throw new ApiError("Recording review is restricted to current authorized exam staff.", 403);
      await db.schoolAiProctorSession.update({ where: { id: session.id }, data: { reviewNote: input.note, reviewedById: user.userId, reviewedAt: new Date() } }); await audit(db, user, session.campusId, session.id, "HUMAN_REVIEW");
    } else {
      if (input.action === "end" && user.role !== "STUDENT") throw new ApiError("Only the candidate can end their browser recording.", 403);
      await db.schoolAiProctorSession.updateMany({ where: { id: session.id, status: { notIn: ["DELETING", "DELETED"] } }, data: input.action === "delete" ? { status: "DELETING", endedAt: session.endedAt ?? new Date(), reviewNote: null, reviewedById: null, reviewedAt: null } : { status: "ENDED", endedAt: session.endedAt ?? new Date() } }); await audit(db, user, session.campusId, session.id, input.action === "delete" ? "DELETE_REQUESTED" : "ENDED");
    }
    return { accepted: true };
  });
}
export async function readExamProctorClip(user: AuthUser, assignmentId: string, clipId: string) {
  const clip = await prisma.schoolAiProctorClip.findFirst({ where: { id: clipId, schoolId: user.schoolId, status: "READY" } }); if (!clip) throw new ApiError("Recording unavailable.", 404);
  const session = await sessionAccess(user, assignmentId, clip.sessionId, prisma); if (!readable(session)) throw new ApiError("This recording has expired or was deleted.", 410);
  const bytes = await readOriginal(clip.storageKey);
  // Access or consent can change while object storage is responding.
  const current = await sessionAccess(user, assignmentId, clip.sessionId, prisma); if (!readable(current)) throw new ApiError("This recording has expired or was deleted.", 410);
  if (bytes.length !== clip.bytes || createHash("sha256").update(bytes).digest("hex") !== clip.checksum) throw new ApiError("Recording integrity check failed.", 409);
  return { bytes, mimeType: clip.mimeType };
}
/** Called inside the worker's tenant context. Expiry hides media even before this sweep runs. */
export async function purgeExpiredExamProctor(schoolId: string, limit = 100) {
  const now = new Date();
  await prisma.schoolAiProctorSession.updateMany({ where: { schoolId, status: { notIn: ["DELETING", "DELETED"] }, retentionUntil: { lte: now } }, data: { status: "DELETING", endedAt: now, reviewNote: null, reviewedById: null, reviewedAt: null } });
  const budget = Math.max(1, Math.min(100, Math.floor(limit)));
  const clips = await prisma.schoolAiProctorClip.findMany({ where: { schoolId, status: { not: "DELETED" }, OR: [{ session: { status: "DELETING" } }, { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 300000) } }] }, orderBy: { createdAt: "asc" }, take: budget }); let deleted = 0;
  for (const clip of clips) { try { await removeOriginal(clip.storageKey); await prisma.schoolAiProctorClip.updateMany({ where: { id: clip.id, schoolId }, data: { status: "DELETED", deletedAt: now } }); deleted++; } catch { /* Durable reservation is retried on the next sweep. */ } }
  const sessions = await prisma.schoolAiProctorSession.findMany({ where: { schoolId, status: "DELETING", clips: { none: { status: { not: "DELETED" } } } }, select: { id: true }, take: budget });
  for (const session of sessions) await prisma.schoolAiProctorSession.updateMany({ where: { id: session.id, schoolId, status: "DELETING", clips: { none: { status: { not: "DELETED" } } } }, data: { status: "DELETED" } });
  return { deleted };
}

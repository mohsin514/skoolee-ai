import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { publishedReportsWhere } from "@/lib/auth/policy";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-423: the weekly family digest. A draft is assembled only from evidence already released to families
// that week (returned assignment feedback, published report cards, the week's recorded attendance); nothing
// is generated or guessed, and a child with no released evidence is left out by default rather than given
// invented progress. A teacher edits the wording (each statement keeps its source), adds at most one home
// activity, then approves the exact content version. Dispatch rechecks every source and every guardian's
// current learning-records access; a changed or withdrawn source blocks that child's update. Each child,
// week, guardian and channel is delivered once, so a retried job never sends twice. Delivery is in-app:
// the notice only says an update is ready, and the content is read after sign-in with access rechecked.

const DAY = 86_400_000;
export type Statement = { id: string; kind: "FEEDBACK" | "REPORT" | "ATTENDANCE"; text: string; sourceType: "feedback" | "report" | "attendance"; sourceId: string; sourceVersion: string | null; sourceLabel: string; edited?: boolean };
export type NextStep = { objective: string; minutes: number; materials: string; alternative: string } | null;
export type EntryContent = { statements: Statement[]; nextStep: NextStep; staffContact: string; noEvidence: boolean };

export function weekStartOf(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError("Choose the week.", 400);
  const date = new Date(`${day}T00:00:00Z`), iso = date.getUTCDay() || 7;
  return new Date(date.getTime() - (iso - 1) * DAY);
}

async function assertClassAccess(user: AuthUser, classId: string, db: Pick<TxClient, "class"> = prisma) {
  const cls = await db.class.findFirst({ where: { id: classId, schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), ...(canManageOperations(user) ? {} : user.role === "TEACHER" ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } : { id: "__none__" }) }, select: { id: true, campusId: true, name: true, section: true, classTeacher: { select: { fullName: true } } } });
  if (!cls) throw new ApiError("You do not review family updates for this class.", 403);
  return cls;
}

async function evidenceFor(tx: TxClient, schoolId: string, studentId: string, from: Date, to: Date): Promise<Statement[]> {
  const [feedback, reports, attendance] = await Promise.all([
    tx.assignmentFeedback.findMany({ where: { schoolId, status: "RETURNED", returnedAt: { gte: from, lt: to }, submissionVersion: { studentId } }, select: { id: true, returnedAt: true, submissionVersion: { select: { submission: { select: { assignment: { select: { title: true } } } } } } } }),
    tx.reportCard.findMany({ where: { schoolId, studentId, ...publishedReportsWhere, generatedAt: { gte: from, lt: to } }, select: { id: true, publishedVersionId: true, exam: { select: { title: true } } } }),
    tx.attendance.findMany({ where: { schoolId, studentId, date: { gte: from, lt: to } }, select: { status: true } }),
  ]);
  const out: Statement[] = [];
  for (const row of feedback) { const title = row.submissionVersion.submission.assignment.title; out.push({ id: `feedback:${row.id}`, kind: "FEEDBACK", text: `Feedback was returned on "${title}".`, sourceType: "feedback", sourceId: row.id, sourceVersion: null, sourceLabel: title }); }
  for (const row of reports) out.push({ id: `report:${row.id}`, kind: "REPORT", text: `The report card for ${row.exam.title} was published.`, sourceType: "report", sourceId: row.id, sourceVersion: row.publishedVersionId, sourceLabel: row.exam.title });
  if (attendance.length) {
    const attended = attendance.filter(a => a.status !== "ABSENT").length;
    out.push({ id: `attendance:${studentId}:${from.toISOString().slice(0, 10)}`, kind: "ATTENDANCE", text: `Attended ${attended} of ${attendance.length} recorded school days.`, sourceType: "attendance", sourceId: studentId, sourceVersion: `${attended}/${attendance.length}`, sourceLabel: "attendance" });
  }
  return out;
}

/** Create (or reopen) the class's draft for a week from released evidence. */
export async function prepareDigest(user: AuthUser, body: Record<string, unknown>) {
  const classId = String(body.classId ?? ""), weekStart = weekStartOf(String(body.week ?? ""));
  const to = new Date(weekStart.getTime() + 7 * DAY);
  if (weekStart.getTime() > Date.now()) throw new ApiError("Prepare a week that has started.", 400);
  return schoolAiTransaction(user, async tx => {
    const cls = await assertClassAccess(user, classId, tx);
    const existing = await tx.familyDigest.findUnique({ where: { classId_weekStart: { classId, weekStart } } });
    if (existing) return existing;
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, classId, archivedAt: null, status: "active" }, select: { id: true }, orderBy: { rollNo: "asc" } });
    const digest = await tx.familyDigest.create({ data: { schoolId: user.schoolId, campusId: cls.campusId, classId, weekStart, createdById: user.userId } });
    for (const student of students) {
      const statements = await evidenceFor(tx, user.schoolId, student.id, weekStart, to);
      const content: EntryContent = { statements, nextStep: null, staffContact: cls.classTeacher?.fullName ?? "", noEvidence: statements.length === 0 };
      await tx.familyDigestEntry.create({ data: { schoolId: user.schoolId, digestId: digest.id, studentId: student.id, content: content as unknown as Prisma.InputJsonValue, skipped: statements.length === 0 } });
    }
    return digest;
  });
}

export async function getDigest(user: AuthUser, id: string) {
  const digest = await prisma.familyDigest.findFirst({ where: { id, schoolId: user.schoolId }, include: { entries: true, deliveries: { select: { entryId: true, guardianUserId: true, status: true, seenAt: true } } } });
  if (!digest) throw new ApiError("Digest not found", 404);
  await assertClassAccess(user, digest.classId);
  const students = new Map((await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: digest.entries.map(e => e.studentId) } }, select: { id: true, fullName: true, rollNo: true } })).map(s => [s.id, s]));
  return { ...digest, entries: digest.entries.map(e => ({ ...e, studentName: students.get(e.studentId)?.fullName ?? "", rollNo: students.get(e.studentId)?.rollNo ?? "", deliveries: digest.deliveries.filter(d => d.entryId === e.id) })).sort((a, b) => a.rollNo.localeCompare(b.rollNo)) };
}

export async function listDigests(user: AuthUser, classId: string) {
  await assertClassAccess(user, classId);
  return prisma.familyDigest.findMany({ where: { schoolId: user.schoolId, classId }, orderBy: { weekStart: "desc" }, take: 12, select: { id: true, weekStart: true, status: true, version: true, approvedVersion: true, scheduledFor: true, sentAt: true } });
}

async function lockDigest(tx: TxClient, user: AuthUser, id: string, knownVersion: unknown) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM family_digests WHERE id = ${id} AND school_id = ${user.schoolId} FOR UPDATE`;
  const digest = locked ? await tx.familyDigest.findUnique({ where: { id } }) : null;
  if (!digest) throw new ApiError("Digest not found", 404);
  await assertClassAccess(user, digest.classId, tx);
  if (Number(knownVersion) !== digest.version) throw new ApiError("This digest changed since you opened it. Review the new version.", 409);
  return digest;
}

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** Edit one child's section: reword or remove sourced statements, set the home activity, include or leave out. */
export async function editEntry(user: AuthUser, digestId: string, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const digest = await lockDigest(tx, user, digestId, body.knownVersion);
    if (digest.status === "SENT" || digest.status === "CANCELLED") throw new ApiError("This digest was already sent or cancelled.", 409);
    const entry = await tx.familyDigestEntry.findFirst({ where: { id: String(body.entryId ?? ""), digestId } });
    if (!entry) throw new ApiError("Entry not found", 404);
    const content = entry.content as unknown as EntryContent;
    const edits = (body.statements && typeof body.statements === "object" ? body.statements : {}) as Record<string, unknown>;
    const remove = new Set((Array.isArray(body.removeStatementIds) ? body.removeStatementIds : []).map(String));
    // Wording can change; the source cannot. New claims without a source cannot be added here.
    const statements = content.statements.filter(s => !remove.has(s.id)).map(s => edits[s.id] !== undefined && clean(edits[s.id], 400) && clean(edits[s.id], 400) !== s.text ? { ...s, text: clean(edits[s.id], 400), edited: true } : s);
    let nextStep = content.nextStep;
    if (body.nextStep === null) nextStep = null;
    else if (body.nextStep && typeof body.nextStep === "object") {
      const n = body.nextStep as Record<string, unknown>, minutes = Number(n.minutes);
      nextStep = { objective: clean(n.objective, 200), minutes, materials: clean(n.materials, 200), alternative: clean(n.alternative, 300) };
      if (nextStep.objective.length < 5 || !Number.isInteger(minutes) || minutes < 1 || minutes > 45 || nextStep.alternative.length < 5) throw new ApiError("A home activity needs its purpose, a time up to 45 minutes and an alternative for families who cannot do it.", 400);
    }
    const skipped = typeof body.skipped === "boolean" ? body.skipped : entry.skipped;
    await tx.familyDigestEntry.update({ where: { id: entry.id }, data: { content: { ...content, statements, nextStep } as unknown as Prisma.InputJsonValue, skipped } });
    // Any edit reopens review: an approval covers one exact version.
    return tx.familyDigest.update({ where: { id: digestId }, data: { version: { increment: 1 }, status: "DRAFT", approvedVersion: null, approvedById: null, approvedAt: null, scheduledFor: null } });
  });
}

export async function approveDigest(user: AuthUser, digestId: string, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const digest = await lockDigest(tx, user, digestId, body.knownVersion);
    if (digest.status !== "DRAFT") throw new ApiError("Only a draft can be approved.", 409);
    const entries = await tx.familyDigestEntry.findMany({ where: { digestId } });
    const included = entries.filter(e => !e.skipped);
    if (!included.length) throw new ApiError("Every child is left out; there is nothing to send.", 409);
    for (const entry of included) { const c = entry.content as unknown as EntryContent; if (!c.statements.length && !c.nextStep) throw new ApiError("A child's update has nothing in it. Add a home activity or leave the child out.", 409); }
    return tx.familyDigest.update({ where: { id: digestId }, data: { status: "APPROVED", approvedVersion: digest.version, approvedById: user.userId, approvedAt: new Date() } });
  });
}

export async function scheduleDigest(user: AuthUser, digestId: string, body: Record<string, unknown>) {
  const at = new Date(String(body.at ?? ""));
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) throw new ApiError("Choose a time from now on.", 400);
  return schoolAiTransaction(user, async tx => {
    const digest = await lockDigest(tx, user, digestId, body.knownVersion);
    if (!["APPROVED", "SCHEDULED"].includes(digest.status) || digest.approvedVersion !== digest.version) throw new ApiError("Approve this version before scheduling it.", 409);
    return tx.familyDigest.update({ where: { id: digestId }, data: { status: "SCHEDULED", scheduledFor: at } });
  });
}

async function sourceStillReleased(tx: TxClient, schoolId: string, s: Statement) {
  if (s.sourceType === "feedback") return Boolean(await tx.assignmentFeedback.findFirst({ where: { id: s.sourceId, schoolId, status: "RETURNED" }, select: { id: true } }));
  if (s.sourceType === "report") return Boolean(await tx.reportCard.findFirst({ where: { id: s.sourceId, schoolId, publishedVersionId: s.sourceVersion, exam: { status: "PUBLISHED" } }, select: { id: true } }));
  // The week's register can be corrected after approval; a different count makes the statement stale.
  const week = s.id.split(":")[2];
  if (!week) return false;
  const from = new Date(`${week}T00:00:00Z`), rows = await tx.attendance.findMany({ where: { schoolId, studentId: s.sourceId, date: { gte: from, lt: new Date(from.getTime() + 7 * DAY) } }, select: { status: true } });
  return `${rows.filter(r => r.status !== "ABSENT").length}/${rows.length}` === s.sourceVersion;
}

/** Deliver an approved digest. Returns the deliveries created now, for the caller's notifications. */
export async function dispatchDigest(schoolId: string, digestId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM family_digests WHERE id = ${digestId} AND school_id = ${schoolId} FOR UPDATE`;
    const digest = locked ? await tx.familyDigest.findUnique({ where: { id: digestId }, include: { entries: true } }) : null;
    if (!digest) throw new ApiError("Digest not found", 404);
    if (digest.status === "SENT") return { created: [] as { guardianUserId: string; studentId: string; deliveryId: string }[], blocked: 0 };
    if (!["APPROVED", "SCHEDULED"].includes(digest.status) || digest.approvedVersion !== digest.version) throw new ApiError("Only an approved version can be sent.", 409);
    if (digest.status === "SCHEDULED" && digest.scheduledFor && digest.scheduledFor > now) throw new ApiError("This digest is scheduled for later.", 409);
    const created: { guardianUserId: string; studentId: string; deliveryId: string }[] = [];
    let blocked = 0;
    for (const entry of digest.entries.filter(e => !e.skipped)) {
      const content = entry.content as unknown as EntryContent;
      const valid = (await Promise.all(content.statements.map(s => sourceStillReleased(tx as unknown as TxClient, schoolId, s)))).every(Boolean);
      if (!valid) { blocked++; await tx.familyDigestEntry.update({ where: { id: entry.id }, data: { status: "BLOCKED", reason: "SOURCE_CHANGED" } }); continue; }
      const guardians = await tx.guardianRelationship.findMany({ where: { studentId: entry.studentId, ...liveGuardianRelationshipWhere(null, "learningRecords", now, schoolId) }, select: { guardianUserId: true } });
      for (const guardianUserId of [...new Set(guardians.map(g => g.guardianUserId).filter((v): v is string => Boolean(v)))]) {
        const existing = await tx.familyDigestDelivery.findUnique({ where: { studentId_weekStart_guardianUserId_channel: { studentId: entry.studentId, weekStart: digest.weekStart, guardianUserId, channel: "IN_APP" } } });
        if (existing) continue;
        const row = await tx.familyDigestDelivery.create({ data: { schoolId, digestId, entryId: entry.id, studentId: entry.studentId, guardianUserId, weekStart: digest.weekStart, version: digest.version } });
        created.push({ guardianUserId, studentId: entry.studentId, deliveryId: row.id });
      }
      await tx.familyDigestEntry.update({ where: { id: entry.id }, data: { status: "SENT", reason: null } });
    }
    await tx.familyDigest.update({ where: { id: digestId }, data: { status: "SENT", sentAt: now } });
    return { created, blocked };
  });
}

/** Scheduled digests whose time has come (cron). */
export async function dueDigests(now = new Date()) {
  return prisma.familyDigest.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, select: { id: true, schoolId: true, campusId: true }, take: 100 });
}

/** A guardian's delivered updates for a child, readable only while learning-records access lasts. */
export async function guardianDigests(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT" || !(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "learningRecords" }))) throw new ApiError("Not found", 404);
  const rows = await prisma.familyDigestDelivery.findMany({ where: { schoolId: user.schoolId, studentId, guardianUserId: user.userId, status: "SENT" }, include: { entry: { select: { content: true } }, digest: { select: { approvedAt: true, approvedById: true } } }, orderBy: { weekStart: "desc" }, take: 8 });
  const unseen = rows.filter(r => !r.seenAt).map(r => r.id);
  if (unseen.length) await prisma.familyDigestDelivery.updateMany({ where: { id: { in: unseen } }, data: { seenAt: new Date() } });
  const reviewers = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(r => r.digest.approvedById).filter((v): v is string => Boolean(v)) } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  return rows.map(r => ({ id: r.id, weekStart: r.weekStart.toISOString().slice(0, 10), version: r.version, content: r.entry.content as unknown as EntryContent, reviewedBy: reviewers.get(r.digest.approvedById ?? "") ?? null, firstSeen: !unseen.includes(r.id) ? r.seenAt : null }));
}

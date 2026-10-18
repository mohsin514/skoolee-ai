import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-442: what happens to the learning when a lesson is covered — on top of the reviewed cover assignment
// (SchoolAiSubstituteDuty, SKO-399), never a second scheduler.
// - Handover: the absent teacher (or a leader) gives the substitute the objective, short staff-only
//   instructions and approved class resources. The substitute can open those resources only through the
//   duty and only until the end of the duty's school day; a cancelled duty or a removed resource ends it.
// - Outcome: the substitute acknowledges and then records what actually happened. "Supervised only" or
//   "did not take place" never counts as delivered: it opens a recovery decision owned by the class's
//   teacher. A lesson that had no cover gets the same decision from the coordinator.
// - Recovery: the owner plans a catch-up (title, instructions, due date), publishes it to the class's
//   Today page, and completes it with an evidence note — or records, with a reason, that none is needed.
// This module sends no notifications (see ./notify).

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES = ["DELIVERED", "SUPERVISED_ONLY", "NOT_HELD"] as const;
const OPEN_RECOVERY = ["DECISION_NEEDED", "PLANNED", "PUBLISHED"];
const text = (value: unknown, max: number) => { const s = String(value ?? "").trim(); return s ? s.slice(0, max) : null; };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function todayFor(schoolId: string, campusId: string | null) { return calendarDateIn((await getLocalePackage(schoolId, campusId)).timezone); }

/** The duty with its lesson facts; snapshot values win so a later timetable edit does not rewrite history. */
async function dutyContext(db: TxClient, schoolId: string, dutyId: string) {
  const duty = await db.schoolAiSubstituteDuty.findFirst({ where: { id: dutyId, schoolId } });
  if (!duty) return null;
  const slot = await db.timetableSlot.findFirst({ where: { id: duty.timetableSlotId, schoolId }, select: { startTime: true, endTime: true, subject: { select: { name: true } }, roomNumber: true, timetable: { select: { classId: true, class: { select: { name: true, section: true } } } } } });
  const snap = (duty.lessonSnapshot ?? {}) as Record<string, unknown>;
  return {
    duty, classId: String(snap.classId ?? slot?.timetable.classId ?? ""),
    lesson: { date: isoDay(duty.date), startTime: String(snap.startTime ?? slot?.startTime ?? ""), endTime: String(snap.endTime ?? slot?.endTime ?? ""), className: String(snap.className ?? [slot?.timetable.class.name, slot?.timetable.class.section].filter(Boolean).join(" ")), subjectName: String(snap.subjectName ?? slot?.subject?.name ?? ""), roomNumber: (snap.roomNumber as string | null) ?? slot?.roomNumber ?? null },
  };
}

const canLead = (user: AuthUser, campusId: string) => canManageOperations(user) && (user.role === "SUPER_ADMIN" || user.campusId === campusId);

// ─── Handover ─────────────────────────────────────────────────────────────

/** The absent teacher or a campus leader writes the handover for an upcoming assigned duty. */
export async function saveHandover(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const ctx = await dutyContext(tx, user.schoolId, String(body.dutyId ?? ""));
    if (!ctx || !(ctx.duty.originalTeacherId === user.userId || canLead(user, ctx.duty.campusId))) throw new ApiError("Cover duty not found", 404);
    if (ctx.duty.status !== "ASSIGNED") throw new ApiError("This cover is no longer assigned.", 409);
    if (ctx.lesson.date < await todayFor(user.schoolId, ctx.duty.campusId)) throw new ApiError("This lesson has already passed.", 409);
    const resourceIds = [...new Set((Array.isArray(body.resourceIds) ? body.resourceIds : []).map(String))].slice(0, 10);
    if (resourceIds.length) {
      const ok = await tx.learningResource.count({ where: { schoolId: user.schoolId, id: { in: resourceIds }, classId: ctx.classId, status: "PUBLISHED" } });
      if (ok !== resourceIds.length) throw new ApiError("Attach only published resources of this class.", 400);
    }
    const objective = text(body.objective, 300), instructions = text(body.instructions, 2000);
    if (!objective) throw new ApiError("Write what the pupils should learn in this lesson.", 400);
    const handover = await tx.coverHandover.upsert({ where: { dutyId: ctx.duty.id }, create: { schoolId: user.schoolId, campusId: ctx.duty.campusId, dutyId: ctx.duty.id, objective, instructions, resourceIds, updatedById: user.userId }, update: { objective, instructions, resourceIds, updatedById: user.userId } });
    return { handover, substituteId: ctx.duty.teacherId, campusId: ctx.duty.campusId };
  });
}

/** The substitute confirms they have the duty and its handover. */
export async function acknowledgeDuty(user: AuthUser, dutyId: string) {
  return schoolAiTransaction(user, async tx => {
    const ctx = await dutyContext(tx, user.schoolId, dutyId);
    if (!ctx || ctx.duty.teacherId !== user.userId || ctx.duty.status !== "ASSIGNED") throw new ApiError("Cover duty not found", 404);
    const existing = await tx.coverHandover.findUnique({ where: { dutyId } });
    if (existing?.acknowledgedAt) return existing;
    return tx.coverHandover.upsert({ where: { dutyId }, create: { schoolId: user.schoolId, campusId: ctx.duty.campusId, dutyId, acknowledgedAt: new Date(), acknowledgedById: user.userId }, update: { acknowledgedAt: new Date(), acknowledgedById: user.userId } });
  });
}

/**
 * The substitute (or a leader) records what actually happened, once, on or after the lesson's day.
 * Anything other than "delivered as planned" opens a recovery decision for the class's teacher.
 */
export async function recordCoverOutcome(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const dutyId = String(body.dutyId ?? "");
    await tx.$queryRaw`SELECT id FROM school_ai_substitute_duties WHERE id = ${dutyId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const ctx = await dutyContext(tx, user.schoolId, dutyId);
    if (!ctx || !(ctx.duty.teacherId === user.userId || canLead(user, ctx.duty.campusId)) || ctx.duty.status !== "ASSIGNED") throw new ApiError("Cover duty not found", 404);
    const outcome = String(body.outcome ?? "") as typeof OUTCOMES[number];
    if (!OUTCOMES.includes(outcome)) throw new ApiError("Say what happened in the lesson.", 400);
    if (ctx.lesson.date > await todayFor(user.schoolId, ctx.duty.campusId)) throw new ApiError("Record the outcome on the day of the lesson or later.", 409);
    const actualActivity = text(body.actualActivity, 1000);
    if (outcome !== "DELIVERED" && !actualActivity) throw new ApiError("Describe what the pupils did instead.", 400);
    const existing = await tx.coverHandover.findUnique({ where: { dutyId } });
    if (existing?.outcome) throw new ApiError("The outcome of this lesson was already recorded.", 409);
    const data = { outcome, actualActivity, outcomeAt: new Date(), outcomeById: user.userId };
    await tx.coverHandover.upsert({ where: { dutyId }, create: { schoolId: user.schoolId, campusId: ctx.duty.campusId, dutyId, ...data }, update: data });
    let recovery = null;
    if (outcome !== "DELIVERED") recovery = await openRecovery(tx, user, { campusId: ctx.duty.campusId, slotId: ctx.duty.timetableSlotId, date: ctx.duty.date, classId: ctx.classId, subjectName: ctx.lesson.subjectName, ownerId: ctx.duty.originalTeacherId, source: outcome, dutyId });
    return { outcome, recoveryId: recovery?.id ?? null, ownerId: ctx.duty.originalTeacherId, campusId: ctx.duty.campusId };
  });
}

async function openRecovery(tx: TxClient, user: AuthUser, input: { campusId: string; slotId: string; date: Date; classId: string; subjectName: string; ownerId: string; source: string; dutyId: string | null }) {
  const existing = await tx.lessonRecovery.findUnique({ where: { schoolId_timetableSlotId_date: { schoolId: user.schoolId, timetableSlotId: input.slotId, date: input.date } } });
  if (existing) return existing;
  return tx.lessonRecovery.create({ data: { schoolId: user.schoolId, campusId: input.campusId, timetableSlotId: input.slotId, date: input.date, classId: input.classId, subjectName: input.subjectName, ownerId: input.ownerId, source: input.source, dutyId: input.dutyId, createdById: user.userId } });
}

/** A lesson that had no cover: the coordinator opens its recovery decision (once). */
export async function recordUncovered(user: AuthUser, body: Record<string, unknown>) {
  const date = String(body.date ?? "");
  if (!DAY.test(date)) throw new ApiError("Choose the lesson date.", 400);
  return schoolAiTransaction(user, async tx => {
    const slot = await tx.timetableSlot.findFirst({ where: { id: String(body.slotId ?? ""), schoolId: user.schoolId, slotType: "CLASS", timetable: { status: "PUBLISHED" } }, select: { id: true, teacherId: true, subject: { select: { name: true } }, timetable: { select: { classId: true, campusId: true } } } });
    if (!slot || !slot.teacherId || !canLead(user, slot.timetable.campusId)) throw new ApiError("Lesson not found", 404);
    const instant = new Date(`${date}T00:00:00Z`);
    const onLeave = await tx.leaveRequest.count({ where: { schoolId: user.schoolId, userId: slot.teacherId, status: "APPROVED", fromDate: { lte: instant }, toDate: { gte: instant } } });
    if (!onLeave) throw new ApiError("This lesson's teacher was not on approved leave that day.", 409);
    if (await tx.schoolAiSubstituteDuty.count({ where: { schoolId: user.schoolId, timetableSlotId: slot.id, date: instant, status: "ASSIGNED" } })) throw new ApiError("This lesson has cover. Record the outcome of the cover instead.", 409);
    const recovery = await openRecovery(tx, user, { campusId: slot.timetable.campusId, slotId: slot.id, date: instant, classId: slot.timetable.classId, subjectName: slot.subject?.name ?? "", ownerId: slot.teacherId, source: "UNCOVERED", dutyId: null });
    return { recovery, ownerId: slot.teacherId, campusId: slot.timetable.campusId };
  });
}

// ─── Recovery ─────────────────────────────────────────────────────────────

/** Owner (or leader) moves a recovery: plan → publish → complete, or not needed with a reason. */
export async function updateRecovery(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const id = String(body.recoveryId ?? "");
    await tx.$queryRaw`SELECT id FROM lesson_recoveries WHERE id = ${id} AND school_id = ${user.schoolId} FOR UPDATE`;
    const row = await tx.lessonRecovery.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!row || !(row.ownerId === user.userId || canLead(user, row.campusId))) throw new ApiError("Recovery not found", 404);
    if (Number(body.knownVersion) !== row.version) throw new ApiError("This follow-up changed since you opened it. Review the latest version.", 409);
    const action = String(body.step ?? "");
    const next = { version: { increment: 1 } };
    if (action === "plan") {
      if (!["DECISION_NEEDED", "PLANNED"].includes(row.status)) throw new ApiError("This catch-up was already shared with the class.", 409);
      const title = text(body.title, 200), dueDate = String(body.dueDate ?? "");
      if (!title) throw new ApiError("Name the catch-up task.", 400);
      if (!DAY.test(dueDate) || dueDate < isoDay(row.date)) throw new ApiError("Give a due date on or after the missed lesson.", 400);
      return tx.lessonRecovery.update({ where: { id }, data: { ...next, status: "PLANNED", title, instructions: text(body.instructions, 2000), dueDate } });
    }
    if (action === "publish") {
      if (row.status !== "PLANNED") throw new ApiError("Plan the catch-up before sharing it.", 409);
      return tx.lessonRecovery.update({ where: { id }, data: { ...next, status: "PUBLISHED", publishedAt: new Date() } });
    }
    if (action === "complete") {
      if (row.status !== "PUBLISHED") throw new ApiError("Share the catch-up with the class before completing it.", 409);
      const evidenceNote = text(body.evidenceNote, 1000);
      if (!evidenceNote) throw new ApiError("Say how you know the learning was recovered.", 400);
      return tx.lessonRecovery.update({ where: { id }, data: { ...next, status: "COMPLETED", evidenceNote, completedAt: new Date(), completedById: user.userId } });
    }
    if (action === "not_needed") {
      if (!["DECISION_NEEDED", "PLANNED"].includes(row.status)) throw new ApiError("A shared catch-up is completed, not dropped.", 409);
      const decisionNote = text(body.note, 1000);
      if (!decisionNote) throw new ApiError("Say why no catch-up is needed.", 400);
      return tx.lessonRecovery.update({ where: { id }, data: { ...next, status: "NOT_NEEDED", decisionNote, completedAt: new Date(), completedById: user.userId } });
    }
    throw new ApiError("Unknown action", 400);
  });
}

// ─── Reading ──────────────────────────────────────────────────────────────

const recoveryView = (r: Awaited<ReturnType<typeof prisma.lessonRecovery.findFirstOrThrow>>, className: string) => ({ id: r.id, version: r.version, date: isoDay(r.date), className, subjectName: r.subjectName, source: r.source, status: r.status, title: r.title, instructions: r.instructions, dueDate: r.dueDate, decisionNote: r.decisionNote, evidenceNote: r.evidenceNote, ownerId: r.ownerId });

async function classNames(schoolId: string, ids: string[]) {
  const rows = ids.length ? await prisma.class.findMany({ where: { schoolId, id: { in: [...new Set(ids)] } }, select: { id: true, name: true, section: true } }) : [];
  return new Map(rows.map(c => [c.id, [c.name, c.section].filter(Boolean).join(" ")]));
}

/** A teacher's cover: duties they cover, their own lessons being covered, and recoveries they own. */
export async function myCover(user: AuthUser) {
  if (user.role !== "TEACHER" && !canManageOperations(user)) throw new ApiError("Cover is for staff.", 403);
  const today = await todayFor(user.schoolId, user.campusId ?? null);
  const since = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000);
  const duties = await prisma.schoolAiSubstituteDuty.findMany({ where: { schoolId: user.schoolId, status: "ASSIGNED", date: { gte: since }, OR: [{ teacherId: user.userId }, { originalTeacherId: user.userId }] }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 200 });
  const handovers = new Map((duties.length ? await prisma.coverHandover.findMany({ where: { dutyId: { in: duties.map(d => d.id) } } }) : []).map(h => [h.dutyId, h]));
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(duties.flatMap(d => [d.teacherId, d.originalTeacherId]))] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName ?? ""]));
  const views = [];
  for (const duty of duties) {
    const ctx = (await dutyContext(prisma, user.schoolId, duty.id))!;
    const h = handovers.get(duty.id);
    const covering = duty.teacherId === user.userId;
    const resources = h?.resourceIds.length ? await prisma.learningResource.findMany({ where: { schoolId: user.schoolId, id: { in: h.resourceIds }, status: "PUBLISHED" }, select: { id: true, title: true, kind: true } }) : [];
    // The absent teacher picks from the class's published resources.
    const choices = !covering ? await prisma.learningResource.findMany({ where: { schoolId: user.schoolId, classId: ctx.classId, status: "PUBLISHED" }, select: { id: true, title: true, kind: true }, orderBy: { title: "asc" }, take: 50 }) : [];
    views.push({ id: duty.id, role: covering ? "COVERING" : "COVERED", ...ctx.lesson, substitute: people.get(duty.teacherId) ?? "", originalTeacher: people.get(duty.originalTeacherId) ?? "",
      handover: h ? { objective: h.objective, instructions: h.instructions, resourceIds: h.resourceIds, acknowledgedAt: h.acknowledgedAt, outcome: h.outcome, actualActivity: h.actualActivity, outcomeAt: h.outcomeAt } : null,
      resources, choices, resourcesOpen: covering && ctx.lesson.date >= today, canRecord: covering && ctx.lesson.date <= today && !h?.outcome });
  }
  const recoveries = await prisma.lessonRecovery.findMany({ where: { schoolId: user.schoolId, ownerId: user.userId, OR: [{ status: { in: OPEN_RECOVERY } }, { updatedAt: { gte: since } }] }, orderBy: [{ date: "asc" }] });
  const names = await classNames(user.schoolId, recoveries.map(r => r.classId));
  return { today, duties: views, recoveries: recoveries.map(r => recoveryView(r, names.get(r.classId) ?? "")) };
}

/** Campus follow-up for a date: covered lessons with handover/outcome, and open recovery decisions. */
export async function campusFollowUp(user: AuthUser, campusId: string, date: string) {
  if (!canLead(user, campusId)) throw new ApiError("Cover follow-up is for campus leaders.", 403);
  if (!DAY.test(date)) throw new ApiError("Choose a date.", 400);
  const instant = new Date(`${date}T00:00:00Z`);
  const duties = await prisma.schoolAiSubstituteDuty.findMany({ where: { schoolId: user.schoolId, campusId, status: "ASSIGNED", date: instant }, orderBy: { id: "asc" } });
  const handovers = new Map((duties.length ? await prisma.coverHandover.findMany({ where: { dutyId: { in: duties.map(d => d.id) } } }) : []).map(h => [h.dutyId, h]));
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(duties.flatMap(d => [d.teacherId, d.originalTeacherId]))] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName ?? ""]));
  const covered = [];
  for (const duty of duties) {
    const ctx = (await dutyContext(prisma, user.schoolId, duty.id))!, h = handovers.get(duty.id);
    covered.push({ id: duty.id, ...ctx.lesson, substitute: people.get(duty.teacherId) ?? "", originalTeacher: people.get(duty.originalTeacherId) ?? "", handoverReady: Boolean(h?.objective), acknowledged: Boolean(h?.acknowledgedAt), outcome: h?.outcome ?? null });
  }
  const recoveries = await prisma.lessonRecovery.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: OPEN_RECOVERY } }, orderBy: { date: "asc" }, take: 100 });
  const names = await classNames(user.schoolId, recoveries.map(r => r.classId));
  const owners = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(recoveries.map(r => r.ownerId))] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName ?? ""]));
  const recorded = await prisma.lessonRecovery.findMany({ where: { schoolId: user.schoolId, campusId, date: instant, source: "UNCOVERED" }, select: { timetableSlotId: true } });
  return { date, covered, recoveries: recoveries.map(r => ({ ...recoveryView(r, names.get(r.classId) ?? ""), owner: owners.get(r.ownerId) ?? "" })), uncoveredRecorded: recorded.map(r => r.timetableSlotId) };
}

/** Published catch-up for a class (learners see these on Today until a week after completion). */
export async function classCatchUp(schoolId: string, classId: string) {
  const rows = await prisma.lessonRecovery.findMany({ where: { schoolId, classId, OR: [{ status: "PUBLISHED" }, { status: "COMPLETED", publishedAt: { not: null }, completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }] }, orderBy: { dueDate: "asc" }, take: 10 });
  return rows.map(r => ({ id: r.id, subject: r.subjectName, lessonDate: isoDay(r.date), title: r.title ?? "", instructions: r.instructions, dueDate: r.dueDate, done: r.status === "COMPLETED" }));
}

/** Approved cover for a class's lessons on one day (Today shows who is teaching, nothing more). */
export async function coverForDay(schoolId: string, slotIds: string[], day: string) {
  if (!slotIds.length) return new Map<string, string>();
  const duties = await prisma.schoolAiSubstituteDuty.findMany({ where: { schoolId, status: "ASSIGNED", date: new Date(`${day}T00:00:00Z`), timetableSlotId: { in: slotIds } }, select: { timetableSlotId: true, teacherId: true } });
  const names = new Map((duties.length ? await prisma.user.findMany({ where: { schoolId, id: { in: duties.map(d => d.teacherId) } }, select: { id: true, fullName: true } }) : []).map(u => [u.id, u.fullName ?? ""]));
  return new Map(duties.map(d => [d.timetableSlotId, names.get(d.teacherId) ?? ""]));
}

/**
 * A substitute may open a handover resource only through an assigned duty that lists it, for that duty's
 * class, until the end of the duty's school day. Returns the published version to serve, or null.
 */
export async function coverResourceGrant(tx: TxClient, user: AuthUser, resource: { id: string; classId: string; status: string; publishedVersion: number | null }) {
  if (user.role !== "TEACHER" || resource.status !== "PUBLISHED" || !resource.publishedVersion) return null;
  const handovers = await tx.coverHandover.findMany({ where: { schoolId: user.schoolId, resourceIds: { has: resource.id } }, select: { dutyId: true, campusId: true } });
  if (!handovers.length) return null;
  const duties = await tx.schoolAiSubstituteDuty.findMany({ where: { schoolId: user.schoolId, id: { in: handovers.map(h => h.dutyId) }, teacherId: user.userId, status: "ASSIGNED" } });
  for (const duty of duties) {
    const ctx = await dutyContext(tx, user.schoolId, duty.id);
    if (ctx && ctx.classId === resource.classId && ctx.lesson.date >= await todayFor(user.schoolId, duty.campusId)) return resource.publishedVersion;
  }
  return null;
}

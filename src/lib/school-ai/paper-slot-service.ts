/**
 * SKO-500 (SKO-408 slice 1): paper slots, the office's request for one paper per grade and subject.
 *
 * "Request papers" groups a session's date-sheet rows by subject name and grade (`Class.name`), so the
 * sections of a grade share one paper. The office (exam permissions, or the campus's exam coordinator)
 * requests, edits and nudges; the author writes the paper in Exam Studio; the slot's status is derived
 * from the linked records on every read and never stored.
 */
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, assertSharedModuleRead, canManageAcademics } from "@/lib/api/scope";
import { assertExamSchedulingAccess } from "@/lib/academic/exam-scheduling-write";
import { notify } from "@/lib/notifications/in-app";
import { getAcademicLead } from "@/lib/notifications/events";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "./transaction";
import { headsOfAuthor, membersHeadedBy } from "./department-heads";
import { examChainPolicy, moderatorFor, validModerator } from "./exam-authority";
import { resolveScopeDeliveryPolicy } from "./repository";
import { paperDataSchema } from "./assessment";
import { contentHash } from "./release";
import { itemStateFor } from "./item-review";
import { MARKS_DUE_WORKING_DAYS, defaultPaperDue, deriveSlotStatus, slotKey, slotOverdue, slotReadiness, workingDaysAfter, type PaperSlotStatus, type SlotFacts } from "./paper-slot-status";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const deliveryKind = z.enum(["PAPER", "ONLINE", "MIXED"]);
const coverage = z.strictObject({ chapters: z.array(z.string().trim().min(1).max(200)).max(50), outcomeIds: z.array(id).max(200).optional() });

export const requestPapersInput = z.strictObject({
  dueOn: date.optional(),
  deliveryKind: deliveryKind.optional(),
  languages: z.array(z.enum(["en", "ar", "ur"])).min(1).max(3).optional(),
  overrides: z.array(z.strictObject({ subjectName: z.string().min(1).max(200), gradeName: z.string().min(1).max(200), dueOn: date.optional(), authorUserId: id.optional(), moderatorUserId: id.optional(), coverageRule: z.enum(["TAUGHT", "EXPLICIT"]).optional(), explicitCoverage: coverage.optional() })).max(200).optional(),
});
export const patchSlotInput = z.strictObject({
  version: z.number().int().positive(),
  dueOn: date.optional(),
  marksDueOn: date.nullable().optional(),
  authorUserId: id.nullable().optional(),
  moderatorUserId: id.nullable().optional(),
  deliveryKind: deliveryKind.optional(),
  coverageRule: z.enum(["TAUGHT", "EXPLICIT"]).optional(),
  explicitCoverage: coverage.nullable().optional(),
  markerOverrides: z.array(z.strictObject({ classId: id, markerUserId: id })).max(50).nullable().optional(),
  copiesRequested: z.number().int().min(0).max(10000).nullable().optional(),
  printed: z.strictObject({ hash: z.string().max(128).optional() }).optional(),
  cancel: z.strictObject({ reason: z.string().trim().min(3).max(500) }).optional(),
  restore: z.literal(true).optional(),
});

const NUDGE_INTERVAL_MS = 12 * 3_600_000;
const ymd = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** The exam office: exam scheduling access (add), or the campus's named exam coordinator. Never approval or release. */
export async function assertExamOffice(user: AuthUser, campusId: string, tx: TxClient) {
  const campus = await tx.campus.findFirst({ where: { id: campusId, schoolId: user.schoolId }, select: { examCoordinatorUserId: true } });
  if (campus?.examCoordinatorUserId && campus.examCoordinatorUserId === user.userId && (user.role === "SUPER_ADMIN" || user.campusId === campusId)) return { coordinator: true };
  await assertExamSchedulingAccess(user, campusId, "add", tx);
  return { coordinator: false };
}

async function campusWeekend(tx: TxClient, schoolId: string, campusId: string): Promise<number[]> {
  const rows = await tx.weekend.findMany({ where: { schoolId, campusId }, select: { dayOfWeek: true } });
  return rows.length ? rows.map(row => row.dayOfWeek) : [7];
}

async function sessionFor(user: AuthUser, sessionId: string, tx: TxClient) {
  const session = await tx.examSession.findFirst({ where: { id: sessionId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true, title: true, paperDueOn: true } });
  if (!session) throw new ApiError("Exam session not found in your campus.", 404);
  return session;
}

/** Create one slot per grade-subject for a session's date sheet, link every section's row, and notify each author. */
export async function requestPapers(user: AuthUser, sessionId: string, raw: unknown) {
  const input = requestPapersInput.parse(raw ?? {});
  const result = await schoolAiTransaction(user, async tx => {
    const session = await sessionFor(user, sessionId, tx);
    await assertExamOffice(user, session.campusId, tx);
    return createSlotsInTransaction(user, session, tx, input);
  });
  notifyRequested(user, result);
  return { created: result.created.length, skipped: result.skipped, linked: result.linked };
}

type CreatedSlots = { campusId: string; sessionTitle: string; created: Array<{ slotId: string; authorUserId: string | null; subjectName: string; gradeName: string; dueOn: string }>; skipped: number; linked: number };

/** After commit: tell each new paper's author. */
export function notifyRequested(user: AuthUser, result: CreatedSlots) {
  for (const slot of result.created) if (slot.authorUserId) notify("EXAM_PAPER_REQUESTED", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, recipientIds: [slot.authorUserId], slotId: slot.slotId, subjectName: slot.subjectName, gradeName: slot.gradeName, sessionTitle: result.sessionTitle, dueOn: slot.dueOn });
}

/**
 * Inside the caller's transaction (the caller has checked office access): one slot per grade-subject,
 * every section's row linked. Used by "Request papers" and by an applied session plan.
 */
export async function createSlotsInTransaction(user: AuthUser, session: { id: string; campusId: string; title: string; paperDueOn: Date | null }, tx: TxClient, input: z.infer<typeof requestPapersInput> = {}): Promise<CreatedSlots> {
  {
    const schedules = await tx.examSchedule.findMany({
      where: { schoolId: user.schoolId, campusId: session.campusId, exam: { sessionId: session.id } },
      select: { id: true, date: true, paperSlotId: true, periodDefinition: { select: { startTime: true, endTime: true } }, subject: { select: { name: true, teacherId: true, totalMarks: true } }, exam: { select: { class: { select: { id: true, name: true, section: true } } } } },
      orderBy: [{ date: "asc" }],
    });
    if (!schedules.length) throw new ApiError("Place the papers on the date sheet first, then request them.", 422);
    const weekend = await campusWeekend(tx, user.schoolId, session.campusId);
    const firstSitting = ymd(schedules[0].date)!;
    const sessionDue = input.dueOn ?? ymd(session.paperDueOn) ?? defaultPaperDue(firstSitting, todayUtc(), weekend);
    if (input.dueOn) await tx.examSession.update({ where: { id: session.id }, data: { paperDueOn: new Date(`${input.dueOn}T00:00:00Z`) } });
    const policy = examChainPolicy((await resolveScopeDeliveryPolicy(user, session.campusId, tx)).policy);
    const leads = await getAcademicLead(user.schoolId, session.campusId);
    const groups = new Map<string, typeof schedules>();
    for (const row of schedules) {
      const key = slotKey(row.subject.name, row.exam.class.name);
      const k = `${key.subjectName}\u0001${key.gradeName}`;
      groups.set(k, [...(groups.get(k) ?? []), row]);
    }
    const created: Array<{ slotId: string; authorUserId: string | null; subjectName: string; gradeName: string; dueOn: string }> = [];
    let skipped = 0, linked = 0;
    for (const rows of groups.values()) {
      const key = slotKey(rows[0].subject.name, rows[0].exam.class.name);
      const display = { subjectName: rows[0].subject.name.trim(), gradeName: rows[0].exam.class.name.trim() };
      const override = input.overrides?.find(row => { const other = slotKey(row.subjectName, row.gradeName); return other.subjectName === key.subjectName && other.gradeName === key.gradeName; });
      let slot = await tx.examPaperSlot.findFirst({ where: { schoolId: user.schoolId, examSessionId: session.id, subjectName: key.subjectName, gradeName: key.gradeName }, select: { id: true } });
      if (slot) skipped += 1;
      else {
        const bySection = [...rows].sort((a, b) => (a.exam.class.section ?? "").localeCompare(b.exam.class.section ?? ""));
        const authorUserId = override?.authorUserId ?? bySection.find(row => row.subject.teacherId)?.subject.teacherId ?? null;
        const moderatorUserId = override?.moderatorUserId ?? moderatorFor({ authorUserId, authorDepartmentHeadIds: authorUserId ? await headsOfAuthor(tx, user.schoolId, authorUserId) : [], academicLeadIds: leads, rule: policy.moderation.moderatorRule });
        if (!validModerator(authorUserId, moderatorUserId)) throw new ApiError("The author of a paper cannot moderate it. Choose another moderator.", 422);
        const period = rows[0].periodDefinition;
        const lastSitting = ymd(rows[rows.length - 1].date)!;
        const dueOn = override?.dueOn ?? sessionDue;
        slot = await tx.examPaperSlot.create({ data: {
          schoolId: user.schoolId, campusId: session.campusId, examSessionId: session.id, subjectName: key.subjectName, gradeName: key.gradeName,
          requestedById: user.userId, dueOn: new Date(`${dueOn}T00:00:00Z`), marksDueOn: new Date(`${workingDaysAfter(lastSitting, MARKS_DUE_WORKING_DAYS, weekend)}T00:00:00Z`),
          totalMarks: Math.max(...rows.map(row => row.subject.totalMarks)), durationMinutes: period ? Math.max(15, minutesOf(period.endTime) - minutesOf(period.startTime)) : 120,
          deliveryKind: input.deliveryKind ?? "PAPER", languages: input.languages ?? ["en"],
          coverageRule: override?.coverageRule ?? "TAUGHT", ...(override?.explicitCoverage ? { explicitCoverage: override.explicitCoverage } : {}),
          authorUserId, moderatorUserId,
        }, select: { id: true } });
        created.push({ slotId: slot.id, authorUserId, ...display, dueOn });
      }
      const unlinked = rows.filter(row => row.paperSlotId !== slot!.id).map(row => row.id);
      if (unlinked.length) { await tx.examSchedule.updateMany({ where: { schoolId: user.schoolId, id: { in: unlinked } }, data: { paperSlotId: slot.id } }); linked += unlinked.length; }
    }
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: session.id, action: "CREATE", campusId: session.campusId, after: { requested: created.length, skipped, linked } });
    return { campusId: session.campusId, sessionTitle: session.title, created, skipped, linked };
  }
}

type SlotRow = Awaited<ReturnType<typeof loadSlots>>[number];
async function loadSlots(tx: TxClient, where: Record<string, unknown>) {
  return tx.examPaperSlot.findMany({ where, orderBy: [{ dueOn: "asc" }, { subjectName: "asc" }, { gradeName: "asc" }], take: 500, include: {
    examSession: { select: { id: true, title: true } },
    schedules: { select: { id: true, date: true, subject: { select: { id: true, name: true, teacherId: true } }, periodDefinition: { select: { periodNumber: true, startTime: true, endTime: true } }, exam: { select: { id: true, status: true, class: { select: { id: true, name: true, section: true } } } } }, orderBy: { date: "asc" } },
  } });
}

export interface SlotView {
  id: string; version: number; sessionId: string; sessionTitle: string;
  subjectName: string; gradeName: string; status: PaperSlotStatus; overdue: boolean;
  readiness: Array<{ tick: string; done: boolean }>;
  dueOn: string; marksDueOn: string | null; totalMarks: number; durationMinutes: number; deliveryKind: string; languages: string[];
  coverageRule: string; explicitCoverage: unknown;
  authorUserId: string | null; authorName: string | null; moderatorUserId: string | null; moderatorName: string | null;
  paperRecordId: string | null; paperVersion: number | null; copiesRequested: number | null; printedAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; lastNudgeAt: string | null; nudgeCount: number;
  sealedAt: string | null; sealPrefix: string | null; compromisedAt: string | null; lastDecision: { decision: string; at: string } | null;
  corrigenda: Array<{ id: string; text: string; at: string }>;
  sections: Array<{ classId: string; subjectId: string; teacherId: string | null; name: string; examId: string; scheduleId: string; date: string }>;
  dates: string[]; period: string | null;
}

async function viewSlots(user: AuthUser, tx: TxClient, rows: SlotRow[], today: string): Promise<SlotView[]> {
  const people = await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(rows.flatMap(row => [row.authorUserId, row.moderatorUserId]).filter((value): value is string => Boolean(value)))] } }, select: { id: true, fullName: true } });
  const name = new Map(people.map(row => [row.id, row.fullName]));
  const papers = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(row => row.paperRecordId).filter((value): value is string => Boolean(value)) }, kind: "PAPER" }, select: { id: true, status: true, version: true, data: true } });
  const paperById = new Map(papers.map(row => [row.id, row]));
  // SKO-501: the latest moderation decision per slot. A signature binds to content, so it keeps holding
  // across an approval's version bump (same hash) and lapses on any edit (new hash).
  const moderations = rows.length ? await tx.examPaperModeration.findMany({ where: { schoolId: user.schoolId, slotId: { in: rows.map(row => row.id) } }, orderBy: { createdAt: "desc" }, select: { slotId: true, decision: true, contentHash: true, paperVersion: true, moderatorId: true, createdAt: true } }) : [];
  const latestModeration = new Map<string, (typeof moderations)[number]>();
  for (const row of moderations) if (!latestModeration.has(row.slotId)) latestModeration.set(row.slotId, row);
  const hashOf = (data: unknown) => { const parsed = paperDataSchema.safeParse(data); if (!parsed.success) return null; try { return contentHash(parsed.data); } catch { return null; } };
  return rows.map(row => {
    const record = row.paperRecordId ? paperById.get(row.paperRecordId) : undefined;
    const parsed = record ? paperDataSchema.safeParse(record.data) : null;
    const dates = [...new Set(row.schedules.map(schedule => ymd(schedule.date)!))];
    const facts: SlotFacts = {
      cancelledAt: row.cancelledAt?.toISOString() ?? null, dueOn: ymd(row.dueOn)!,
      paper: record ? { status: record.status as "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED", version: record.version, itemStates: parsed?.success ? parsed.data.questions.map(itemStateFor) : [] } : null,
      moderation: (() => {
        const latest = latestModeration.get(row.id);
        if (!latest || !record) return null;
        const current = hashOf(record.data);
        return { decision: latest.decision as "SIGNED" | "RETURNED", paperVersion: current && current === latest.contentHash ? record.version : latest.paperVersion };
      })(),
      seal: row.sealedAt ? { paperVersion: row.paperVersion ?? 0, sittingDate: ymd(row.sealedSittingDate) } : null,
      sittingDates: dates, printed: Boolean(row.printedAt), windowOpen: false, attendanceComplete: false, marksComplete: false,
      published: row.schedules.length > 0 && row.schedules.every(schedule => schedule.exam.status === "PUBLISHED"),
    };
    const status = deriveSlotStatus(facts);
    const period = row.schedules[0]?.periodDefinition;
    const display = row.schedules[0];
    return {
      id: row.id, version: row.version, sessionId: row.examSession.id, sessionTitle: row.examSession.title,
      subjectName: display?.subject.name ?? row.subjectName, gradeName: display?.exam.class.name ?? row.gradeName,
      status, overdue: slotOverdue(status, facts.dueOn, today),
      readiness: slotReadiness({ authorUserId: row.authorUserId, moderatorUserId: row.moderatorUserId, deliveryKind: row.deliveryKind, facts }),
      dueOn: facts.dueOn, marksDueOn: ymd(row.marksDueOn), totalMarks: row.totalMarks, durationMinutes: row.durationMinutes, deliveryKind: row.deliveryKind,
      languages: Array.isArray(row.languages) ? (row.languages as string[]) : ["en"], coverageRule: row.coverageRule, explicitCoverage: row.explicitCoverage ?? null,
      authorUserId: row.authorUserId, authorName: row.authorUserId ? name.get(row.authorUserId) ?? null : null,
      moderatorUserId: row.moderatorUserId, moderatorName: row.moderatorUserId ? name.get(row.moderatorUserId) ?? null : null,
      paperRecordId: row.paperRecordId, paperVersion: row.paperVersion, copiesRequested: row.copiesRequested, printedAt: row.printedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null, cancelReason: row.cancelReason, lastNudgeAt: row.lastNudgeAt?.toISOString() ?? null, nudgeCount: row.nudgeCount,
      sealedAt: row.sealedAt?.toISOString() ?? null, sealPrefix: row.sealHash ? row.sealHash.slice(0, 16) : null, compromisedAt: row.compromisedAt?.toISOString() ?? null,
      corrigenda: (Array.isArray(row.corrigenda) ? row.corrigenda as Array<{ id: string; text: string; at: string }> : []).map(entry => ({ id: entry.id, text: entry.text, at: entry.at })),
      lastDecision: latestModeration.get(row.id) ? { decision: latestModeration.get(row.id)!.decision, at: latestModeration.get(row.id)!.createdAt.toISOString() } : null,
      sections: row.schedules.map(schedule => ({ classId: schedule.exam.class.id, subjectId: schedule.subject.id, teacherId: schedule.subject.teacherId, name: schedule.exam.class.section ? `${schedule.exam.class.name} ${schedule.exam.class.section}` : schedule.exam.class.name, examId: schedule.exam.id, scheduleId: schedule.id, date: ymd(schedule.date)! })),
      dates, period: period ? `${period.startTime}–${period.endTime}` : null,
    };
  });
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Every slot of a session, for the office's Papers step. Readable by anyone who reads the exams module. */
export async function listSessionSlots(user: AuthUser, sessionId: string, today = todayUtc()) {
  await assertSharedModuleRead(user, "exams");
  return schoolAiTransaction(user, async tx => {
    const session = await sessionFor(user, sessionId, tx);
    const office = await assertExamOffice(user, session.campusId, tx).then(() => true, () => false);
    const slots = await viewSlots(user, tx, await loadSlots(tx, { schoolId: user.schoolId, examSessionId: session.id }), today);
    const sealed = slots.filter(slot => ["SEALED", "PRINTED", "GATE_OPEN", "SAT", "MARKED", "PUBLISHED"].includes(slot.status)).length;
    const scheduledRows = await tx.examSchedule.count({ where: { schoolId: user.schoolId, exam: { sessionId: session.id } } });
    const unlinkedRows = await tx.examSchedule.count({ where: { schoolId: user.schoolId, exam: { sessionId: session.id }, paperSlotId: null } });
    // The office reassigns authors and moderators from the campus's active teaching staff.
    const staff = office ? await tx.user.findMany({ where: { schoolId: user.schoolId, campusId: session.campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }) : [];
    return { slots, office, staff: staff.map(row => ({ id: row.id, name: row.fullName })), progress: { slots: slots.filter(slot => slot.status !== "CANCELLED").length, sealed }, scheduledRows, unlinkedRows, paperDueOn: ymd((await tx.examSession.findFirst({ where: { id: session.id, schoolId: user.schoolId }, select: { paperDueOn: true } }))?.paperDueOn) };
  });
}

/** The slots that concern this person: the ones they write or moderate, their department's (as head), and the campus's (as office). */
export async function mySlots(user: AuthUser, today = todayUtc()) {
  return schoolAiTransaction(user, async tx => {
    if (!user.campusId && user.role !== "SUPER_ADMIN") return { viewerId: user.userId, slots: [], scope: "NONE" as const };
    const campus = user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId! };
    const office = user.campusId ? await assertExamOffice(user, user.campusId, tx).then(() => true, () => false) : canManageAcademics(user);
    const members = await membersHeadedBy(tx, user.schoolId, user.userId);
    const where = office
      ? { schoolId: user.schoolId, ...campus }
      : { schoolId: user.schoolId, ...campus, OR: [{ authorUserId: user.userId }, { moderatorUserId: user.userId }, ...(members.length ? [{ authorUserId: { in: members } }] : [])] };
    const slots = await viewSlots(user, tx, await loadSlots(tx, where), today);
    return { viewerId: user.userId, slots: slots.filter(slot => slot.status !== "CANCELLED" || slot.authorUserId === user.userId), scope: office ? "OFFICE" as const : members.length ? "DEPARTMENT" as const : "MINE" as const };
  });
}

/** One slot, for the author, its moderator, the author's head or the office. */
export async function getSlot(user: AuthUser, slotId: string, tx: TxClient, today = todayUtc()) {
  const row = (await loadSlots(tx, { id: slotId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }))[0];
  if (!row) throw new ApiError("Paper request not found in your campus.", 404);
  const office = await assertExamOffice(user, row.campusId, tx).then(() => true, () => false);
  const heads = row.authorUserId ? (await headsOfAuthor(tx, user.schoolId, row.authorUserId)).includes(user.userId) : false;
  if (!office && !heads && row.authorUserId !== user.userId && row.moderatorUserId !== user.userId) throw new ApiError("Paper request not found in your campus.", 404);
  return { row, view: (await viewSlots(user, tx, [row], today))[0], office };
}

export async function patchSlot(user: AuthUser, slotId: string, raw: unknown) {
  const input = patchSlotInput.parse(raw);
  const result = await schoolAiTransaction(user, async tx => {
    const current = await tx.examPaperSlot.findFirst({ where: { id: slotId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
    if (!current) throw new ApiError("Paper request not found in your campus.", 404);
    await assertExamOffice(user, current.campusId, tx);
    const author = input.authorUserId !== undefined ? input.authorUserId : current.authorUserId;
    const moderator = input.moderatorUserId !== undefined ? input.moderatorUserId : current.moderatorUserId;
    if (!validModerator(author, moderator)) throw new ApiError("The author of a paper cannot moderate it. Choose another moderator.", 422);
    for (const person of [input.authorUserId, input.moderatorUserId].filter((value): value is string => Boolean(value))) {
      const staff = await tx.user.findFirst({ where: { id: person, schoolId: user.schoolId, campusId: current.campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"] } }, select: { id: true } });
      if (!staff) throw new ApiError("Choose an active member of staff from this campus.", 422);
    }
    if (input.cancel && current.cancelledAt) throw new ApiError("This paper request is already cancelled.", 409);
    const data = {
      ...(input.dueOn ? { dueOn: new Date(`${input.dueOn}T00:00:00Z`) } : {}),
      ...(input.marksDueOn !== undefined ? { marksDueOn: input.marksDueOn ? new Date(`${input.marksDueOn}T00:00:00Z`) : null } : {}),
      ...(input.authorUserId !== undefined ? { authorUserId: input.authorUserId } : {}),
      ...(input.moderatorUserId !== undefined ? { moderatorUserId: input.moderatorUserId } : {}),
      ...(input.deliveryKind ? { deliveryKind: input.deliveryKind } : {}),
      ...(input.coverageRule ? { coverageRule: input.coverageRule } : {}),
      ...(input.explicitCoverage !== undefined ? { explicitCoverage: input.explicitCoverage ?? undefined } : {}),
      ...(input.markerOverrides !== undefined ? { markerOverrides: input.markerOverrides ?? undefined } : {}),
      ...(input.copiesRequested !== undefined ? { copiesRequested: input.copiesRequested } : {}),
      ...(input.printed ? { printedById: user.userId, printedAt: new Date(), printedHash: input.printed.hash ?? null } : {}),
      // Cancelling keeps the paper; it only withdraws the request.
      ...(input.cancel ? { cancelledAt: new Date(), cancelReason: input.cancel.reason } : {}),
      ...(input.restore ? { cancelledAt: null, cancelReason: null } : {}),
    };
    const updated = await tx.examPaperSlot.updateMany({ where: { id: slotId, schoolId: user.schoolId, version: input.version }, data: { ...data, version: { increment: 1 } } });
    if (updated.count !== 1) throw new ApiError("This paper request changed meanwhile. Reload and try again.", 409);
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: slotId, action: "UPDATE", campusId: current.campusId, after: { fields: Object.keys(data).join(",") } });
    const authorChanged = input.authorUserId && input.authorUserId !== current.authorUserId ? input.authorUserId : null;
    return { view: (await getSlot(user, slotId, tx)).view, authorChanged, campusId: current.campusId };
  });
  const { view, authorChanged } = result;
  if (authorChanged) notify("EXAM_PAPER_REQUESTED", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, recipientIds: [authorChanged], slotId, subjectName: view.subjectName, gradeName: view.gradeName, sessionTitle: view.sessionTitle, dueOn: view.dueOn });
  return view;
}

export async function nudgeSlot(user: AuthUser, slotId: string, now = new Date()) {
  const result = await schoolAiTransaction(user, async tx => {
    const current = await tx.examPaperSlot.findFirst({ where: { id: slotId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true, authorUserId: true, lastNudgeAt: true, cancelledAt: true } });
    if (!current) throw new ApiError("Paper request not found in your campus.", 404);
    await assertExamOffice(user, current.campusId, tx);
    if (current.cancelledAt) throw new ApiError("This paper request is cancelled.", 409);
    if (!current.authorUserId) throw new ApiError("Choose an author before sending a reminder.", 422);
    if (current.lastNudgeAt && now.getTime() - current.lastNudgeAt.getTime() < NUDGE_INTERVAL_MS) throw new ApiError("A reminder was sent in the last 12 hours.", 429);
    await tx.examPaperSlot.update({ where: { id: slotId }, data: { lastNudgeAt: now, nudgeCount: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "exam_paper_slots", recordId: slotId, action: "UPDATE", campusId: current.campusId, after: { nudged: true } });
    return { authorUserId: current.authorUserId, campusId: current.campusId, view: (await getSlot(user, slotId, tx)).view };
  });
  notify("EXAM_PAPER_DUE_SOON", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, recipientIds: [result.authorUserId], slotId, subjectName: result.view.subjectName, gradeName: result.view.gradeName, sessionTitle: result.view.sessionTitle, dueOn: result.view.dueOn });
  return result.view;
}

/**
 * Called inside the PAPER save transaction when the paper names a slot: only the slot's author (or a
 * manager) may write it, and the slot then points at this paper and version. Sending it for review
 * tells the moderator.
 */
export async function linkPaperToSlot(user: AuthUser, paper: { id: string; version: number; status: string; campusId: string | null }, slotId: string, tx: TxClient, action: string) {
  const slot = await tx.examPaperSlot.findFirst({ where: { id: slotId, schoolId: user.schoolId, campusId: paper.campusId ?? "" }, select: { id: true, authorUserId: true, moderatorUserId: true, paperRecordId: true, cancelledAt: true, sealedAt: true, subjectName: true, gradeName: true, examSession: { select: { title: true } }, schedules: { take: 1, select: { subject: { select: { name: true } }, exam: { select: { class: { select: { name: true } } } } } } } });
  if (!slot) throw new ApiError("This paper names a request that is not in your campus.", 403);
  if (slot.authorUserId !== user.userId && !canManageAcademics(user)) throw new ApiError("Only the paper's author writes the requested paper.", 403);
  if (slot.paperRecordId && slot.paperRecordId !== paper.id) throw new ApiError("Another paper already answers this request.", 409);
  // A sealed slot keeps its sealed version, so a later edit reads CHANGED_AFTER_APPROVAL and cannot print.
  await tx.examPaperSlot.update({ where: { id: slot.id }, data: slot.sealedAt ? { paperRecordId: paper.id } : { paperRecordId: paper.id, paperVersion: paper.version } });
}

/**
 * The brief for a requested paper, created once and returned after. The office's request settles the
 * subject, class, duration, total marks, languages and form count: each is a confirmed fact by the
 * person who requested the paper, at the time they requested it, marked `fromSlotId`. Coverage, tier
 * and accommodation stay open for the author. Only the author (or a manager) opens it, because the
 * brief belongs to the author's own subject and class.
 */
export async function slotBrief(user: AuthUser, slotId: string) {
  const prepared = await schoolAiTransaction(user, async tx => {
    const { row, view } = await getSlot(user, slotId, tx);
    if (row.authorUserId !== user.userId && !canManageAcademics(user)) throw new ApiError("Only the paper's author starts its brief.", 403);
    if (row.cancelledAt) throw new ApiError("This paper request is cancelled.", 409);
    if (row.briefRecordId) {
      const existing = await tx.schoolAiRecord.findFirst({ where: { id: row.briefRecordId, schoolId: user.schoolId, kind: "BRIEF", status: { not: "ARCHIVED" } }, select: { id: true } });
      if (existing) {
        const brief = await tx.schoolAiRecord.findFirst({ where: { id: existing.id, schoolId: user.schoolId }, select: { subjectId: true, classId: true } });
        return { existing: existing.id, row, view, subjectId: brief?.subjectId ?? undefined, classId: brief?.classId ?? undefined };
      }
    }
    const sections = await tx.subject.findMany({ where: { schoolId: user.schoolId, campusId: row.campusId, classId: { in: view.sections.map(section => section.classId) } }, select: { id: true, name: true, classId: true, teacherId: true } });
    const matching = sections.filter(subject => slotKey(subject.name, "x").subjectName === row.subjectName);
    const mine = matching.find(subject => subject.teacherId === (row.authorUserId ?? user.userId)) ?? matching[0];
    if (!mine) throw new ApiError("This subject is no longer taught in the grade's sections.", 409);
    return { existing: null, row, view, subjectId: mine.id, classId: mine.classId };
  });
  if (prepared.existing) return { briefId: prepared.existing, created: false, subjectId: prepared.subjectId ?? null, classId: prepared.classId ?? null };
  const { row, view } = prepared;
  const { emptyAssessmentBrief, assessmentBriefSchema } = await import("./assessment-brief");
  const { createWorkspaceRecord } = await import("./repository");
  const scope = { schoolId: user.schoolId, campusId: row.campusId, classId: prepared.classId!, subjectId: prepared.subjectId! };
  const at = row.requestedAt.toISOString();
  const facts: Record<string, unknown> = { subject: scope.subjectId, class: scope.classId, durationMinutes: row.durationMinutes, totalMarks: row.totalMarks, languages: view.languages, formCount: row.formCount };
  const brief = emptyAssessmentBrief({ subjectId: scope.subjectId, classId: scope.classId });
  for (const [key, value] of Object.entries(facts)) {
    (brief.decisions as Record<string, unknown>)[key] = { classification: "CONFIRMED_FACT", value, actorId: row.requestedById, at, scope, fromSlotId: row.id };
    brief.history.push({ key: key as (typeof brief.history)[number]["key"], event: "CONFIRMED", actorId: row.requestedById, at, from: "OPEN_DECISION", to: "CONFIRMED_FACT" });
  }
  const data = assessmentBriefSchema.parse(brief);
  const record = await createWorkspaceRecord(user, { kind: "BRIEF", title: `${view.subjectName} ${view.gradeName} · ${view.sessionTitle}`.slice(0, 180), campusId: row.campusId, idempotencyKey: `slot-brief-${row.id}`.slice(0, 128), data: data as unknown as Record<string, unknown> });
  await schoolAiTransaction(user, tx => tx.examPaperSlot.updateMany({ where: { id: row.id, schoolId: user.schoolId }, data: { briefRecordId: record.id } }));
  return { briefId: record.id, created: true, subjectId: scope.subjectId, classId: scope.classId };
}

/** After the PAPER save commits: sending a requested paper for review tells its moderator. */
export async function notifyPaperSubmitted(user: AuthUser, paper: { id: string; campusId: string | null }, slotId: string) {
  const slot = await schoolAiTransaction(user, tx => tx.examPaperSlot.findFirst({ where: { id: slotId, schoolId: user.schoolId, paperRecordId: paper.id }, select: { id: true, moderatorUserId: true, subjectName: true, gradeName: true, examSession: { select: { title: true } }, schedules: { take: 1, select: { subject: { select: { name: true } }, exam: { select: { class: { select: { name: true } } } } } } } }));
  if (!slot?.moderatorUserId) return;
  const author = await schoolAiTransaction(user, tx => tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { fullName: true } }));
  notify("EXAM_PAPER_SUBMITTED", { schoolId: user.schoolId, campusId: paper.campusId, actorId: user.userId, recipientIds: [slot.moderatorUserId], slotId: slot.id, subjectName: slot.schedules[0]?.subject.name ?? slot.subjectName, gradeName: slot.schedules[0]?.exam.class.name ?? slot.gradeName, sessionTitle: slot.examSession.title, authorName: author?.fullName ?? "" });
}

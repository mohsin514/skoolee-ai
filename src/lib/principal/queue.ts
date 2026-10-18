import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { getLocalePackage } from "@/lib/locale/store";
import { schoolToday } from "@/lib/fees/statement";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-417: one accountable queue derived from live source conditions. Each item names its source record,
// the deterministic trigger, the owner and the next action, and links to the workspace that resolves it.
// The queue never closes anything itself: an item leaves the active list only when its source condition
// is gone (attendance submitted, leave decided, version approved, message delivered, complaint owned or
// resolved, adjustment decided). Assignment, acknowledgement and a reasoned snooze are the only state it
// stores (QueueItemState), with history (QueueItemEvent).

export const QUEUE_TYPES = ["COMPLAINT", "ATTENDANCE_MISSING", "DELIVERY_FAILED", "LEAVE_PENDING", "REPORT_APPROVAL", "ADJUSTMENT_APPROVAL", "SUPPORT_CHECKIN"] as const;
export type QueueType = typeof QUEUE_TYPES[number];
/** Published ranking: overdue first, then this category order, then the earliest due time. */
const RANK: Record<QueueType, number> = { COMPLAINT: 1, ATTENDANCE_MISSING: 2, DELIVERY_FAILED: 3, LEAVE_PENDING: 4, REPORT_APPROVAL: 5, ADJUSTMENT_APPROVAL: 6, SUPPORT_CHECKIN: 7 };
export const SORTING_RULE = "Overdue items first; then confidential and late complaints, missing attendance today, failed family messages, leave to decide, report versions to approve, fee adjustments to decide, and missed learning-action check-ins; then the earliest due time. No pupil risk score is used.";

export type SourceItem = {
  key: string; type: QueueType; sourceId: string; title: string; trigger: string; nextAction: string;
  sourceOwner: { id: string; name: string } | null; dueAt: string | null; link: string; count?: number;
};
export type QueueItem = SourceItem & {
  overdue: boolean; reason: string; assignee: { id: string; name: string } | null; acknowledgedAt: string | null;
  snoozedUntil: string | null; snoozeReason: string | null; snoozed: boolean; version: number;
};

const LEADERS = ["SUPER_ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
export function assertQueueAccess(user: AuthUser) {
  if (!LEADERS.includes(user.role)) throw new ApiError("The action queue is for campus leaders.", 403);
}
const consoleBase = (user: AuthUser) => (user.role === "PRINCIPAL" ? "/principal" : "/admin");
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999Z`);

/** Every currently true source condition for the campus. Errors per source are reported, not hidden. */
export async function collectSources(user: AuthUser, campusId: string, db: TxClient = prisma) {
  const base = consoleBase(user);
  const policy = await getLocalePackage(user.schoolId, campusId, undefined, undefined, db);
  const today = schoolToday(policy.timezone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const items: SourceItem[] = [], failed: string[] = [];
  const scope = { schoolId: user.schoolId, campusId };
  const run = async (name: QueueType, fn: () => Promise<void>) => { try { await fn(); } catch (error) { console.error(`[queue] ${name} source failed`, error); failed.push(name); } };

  await run("ATTENDANCE_MISSING", async () => {
    if (policy.weekend.includes(weekday)) return;
    const classes = await db.class.findMany({ where: { ...scope, archivedAt: null, students: { some: { archivedAt: null } } }, select: { id: true, name: true, section: true, classTeacher: { select: { id: true, fullName: true } } } });
    if (!classes.length) return;
    const marked = await db.attendance.groupBy({ by: ["classId"], where: { ...scope, date: new Date(`${today}T00:00:00.000Z`), classId: { in: classes.map(c => c.id) } } });
    const done = new Set(marked.map(row => row.classId));
    for (const cls of classes) if (!done.has(cls.id)) {
      const name = `${cls.name}${cls.section ? ` ${cls.section}` : ""}`;
      items.push({ key: `ATTENDANCE_MISSING:${cls.id}:${today}`, type: "ATTENDANCE_MISSING", sourceId: cls.id, title: `Attendance not submitted for ${name}`, trigger: `No attendance is recorded for ${name} on ${today}.`, nextAction: "Ask the class teacher to submit today's attendance", sourceOwner: cls.classTeacher ? { id: cls.classTeacher.id, name: cls.classTeacher.fullName } : null, dueAt: endOfDay(today).toISOString(), link: `${base}?view=attendance` });
    }
  });
  await run("LEAVE_PENDING", async () => {
    const pending = await db.leaveRequest.findMany({ where: { ...scope, status: "PENDING" }, select: { id: true, fromDate: true, toDate: true, user: { select: { fullName: true } }, leaveType: { select: { name: true } } }, orderBy: { fromDate: "asc" }, take: 100 });
    for (const leave of pending) {
      const from = leave.fromDate.toISOString().slice(0, 10);
      items.push({ key: `LEAVE_PENDING:${leave.id}`, type: "LEAVE_PENDING", sourceId: leave.id, title: `Leave to decide: ${leave.user.fullName}`, trigger: `${leave.leaveType.name} leave from ${from} to ${leave.toDate.toISOString().slice(0, 10)} is waiting for a decision.`, nextAction: "Approve or reject the leave request", sourceOwner: null, dueAt: new Date(new Date(`${from}T00:00:00.000Z`).getTime() - 1).toISOString(), link: `${base}?view=leave` });
    }
  });
  await run("REPORT_APPROVAL", async () => {
    const awaiting = await db.reportVersion.findMany({ where: { schoolId: user.schoolId, approvedAt: null, reportCard: { campusId, currentVersionId: { not: null } } }, select: { id: true, reportCardId: true, reportCard: { select: { currentVersionId: true, examId: true, exam: { select: { title: true } } } } } });
    const byExam = new Map<string, { title: string; count: number }>();
    for (const version of awaiting) {
      if (version.reportCard.currentVersionId !== version.id) continue; // only the current version needs a decision
      const entry = byExam.get(version.reportCard.examId) ?? { title: version.reportCard.exam.title, count: 0 };
      entry.count += 1; byExam.set(version.reportCard.examId, entry);
    }
    for (const [examId, entry] of byExam) items.push({ key: `REPORT_APPROVAL:${examId}`, type: "REPORT_APPROVAL", sourceId: examId, count: entry.count, title: `${entry.count} report version(s) still need approval`, trigger: `${entry.count} current report version(s) for ${entry.title} are not approved.`, nextAction: "Open report review", sourceOwner: null, dueAt: null, link: `${base}?view=report-cards` });
  });
  await run("DELIVERY_FAILED", async () => {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const failures = await db.parentCommunication.findMany({ where: { ...scope, status: "FAILED", createdAt: { gte: since } }, select: { id: true, channel: true, recipientName: true, templateKey: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    for (const message of failures) items.push({ key: `DELIVERY_FAILED:${message.id}`, type: "DELIVERY_FAILED", sourceId: message.id, title: `Message to ${message.recipientName ?? "a family"} was not delivered`, trigger: `The ${message.channel.toLowerCase()} message (${message.templateKey}) sent on ${message.createdAt.toISOString().slice(0, 10)} failed.`, nextAction: "Check the contact details and resend", sourceOwner: null, dueAt: new Date(message.createdAt.getTime() + 2 * 86_400_000).toISOString(), link: "/dashboard/communications" });
  });
  await run("COMPLAINT", async () => {
    const complaints = await db.complaint.findMany({ where: { ...scope, status: { not: "RESOLVED" }, OR: [{ ownerId: null }, { dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } }] }, select: { id: true, referenceCode: true, type: true, confidential: true, ownerId: true, dueDate: true, date: true, owner: { select: { id: true, fullName: true } } } });
    for (const complaint of complaints) {
      const late = complaint.dueDate && complaint.dueDate < new Date(`${today}T00:00:00.000Z`);
      // A confidential concern shows only its reference: no category, no complainant.
      const label = complaint.confidential ? `Confidential concern ${complaint.referenceCode}` : `Complaint ${complaint.referenceCode} (${complaint.type})`;
      items.push({ key: `COMPLAINT:${complaint.id}`, type: "COMPLAINT", sourceId: complaint.id, title: complaint.ownerId ? `${label} is past its response date` : `${label} has no owner`, trigger: complaint.ownerId ? `The response was due ${complaint.dueDate?.toISOString().slice(0, 10)}.` : `Received ${complaint.date.toISOString().slice(0, 10)} and not yet assigned.`, nextAction: complaint.ownerId ? "Follow up with the owner or resolve the complaint" : "Assign an owner in Complaints", sourceOwner: complaint.owner ? { id: complaint.owner.id, name: complaint.owner.fullName } : null, dueAt: late ? complaint.dueDate!.toISOString() : endOfDay(complaint.date.toISOString().slice(0, 10)).toISOString(), link: `${base}?view=complaints` });
    }
  });
  await run("ADJUSTMENT_APPROVAL", async () => {
    const requested = await db.financialAdjustment.findMany({ where: { ...scope, status: "REQUESTED" }, select: { id: true, kind: true, createdAt: true } });
    for (const adjustment of requested) items.push({ key: `ADJUSTMENT_APPROVAL:${adjustment.id}`, type: "ADJUSTMENT_APPROVAL", sourceId: adjustment.id, title: `${adjustment.kind === "REFUND" ? "Refund" : adjustment.kind === "WAIVER" ? "Waiver" : "Credit note"} awaiting a decision`, trigger: `Requested on ${adjustment.createdAt.toISOString().slice(0, 10)}; a different approver must decide.`, nextAction: "Review the adjustment in Fees", sourceOwner: null, dueAt: new Date(adjustment.createdAt.getTime() + 3 * 86_400_000).toISOString(), link: `${base}?view=fees` });
  });
  // SKO-425: a missed learning-action check-in stays here until it is recorded or rescheduled.
  await run("SUPPORT_CHECKIN", async () => {
    const overdue = await db.interventionPlan.findMany({ where: { ...scope, status: "ACTIVE", nextCheckInDate: { lt: new Date(`${today}T00:00:00.000Z`) } }, select: { id: true, title: true, nextCheckInDate: true, ownerId: true } });
    const owners = new Map((await db.user.findMany({ where: { id: { in: overdue.map(o => o.ownerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
    for (const plan of overdue) {
      const due = plan.nextCheckInDate!.toISOString().slice(0, 10);
      items.push({ key: `SUPPORT_CHECKIN:${plan.id}:${due}`, type: "SUPPORT_CHECKIN", sourceId: plan.id, title: `Learning-action check-in missed: ${plan.title}`, trigger: `The check-in due on ${due} is not recorded or rescheduled.`, nextAction: "Ask the responsible adult to record or reschedule the check-in", sourceOwner: plan.ownerId ? { id: plan.ownerId, name: owners.get(plan.ownerId) ?? "" } : null, dueAt: endOfDay(due).toISOString(), link: `${base}?view=overview` });
    }
  });
  return { items, failed, checkedAt: new Date().toISOString(), today };
}

function reasonFor(item: SourceItem, overdue: boolean, now: number) {
  if (overdue) return `Overdue since ${item.dueAt!.slice(0, 10)}`;
  if (!item.dueAt) return "No deadline; ranked by category";
  const hours = (Date.parse(item.dueAt) - now) / 3_600_000;
  return hours <= 24 ? "Due within a day" : `Due ${item.dueAt.slice(0, 10)}`;
}

/** Active queue plus resolved history. Items whose source condition has gone are recorded as resolved. */
export async function loadQueue(user: AuthUser, campusId: string) {
  assertQueueAccess(user);
  const { items, failed, checkedAt } = await collectSources(user, campusId);
  const states = await prisma.queueItemState.findMany({ where: { schoolId: user.schoolId, campusId } });
  const active = new Set(items.map(item => item.key));
  const settled = states.filter(state => !state.resolvedAt && !active.has(state.itemKey));
  // Failed source feeds must not be read as "resolved": only settle keys whose own source loaded.
  const settleable = settled.filter(state => !failed.includes(state.itemKey.split(":")[0]));
  if (settleable.length) {
    await prisma.$transaction([
      prisma.queueItemState.updateMany({ where: { id: { in: settleable.map(s => s.id) }, resolvedAt: null }, data: { resolvedAt: new Date() } }),
      prisma.queueItemEvent.createMany({ data: settleable.map(s => ({ schoolId: user.schoolId, campusId, itemKey: s.itemKey, kind: "RESOLVED", note: "The source condition is resolved." })) }),
    ]);
  }
  // A key that reappears (e.g. a reopened complaint) is active again.
  const reopened = states.filter(state => state.resolvedAt && active.has(state.itemKey));
  if (reopened.length) await prisma.queueItemState.updateMany({ where: { id: { in: reopened.map(s => s.id) } }, data: { resolvedAt: null } });
  const byKey = new Map(states.map(state => [state.itemKey, state]));
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: states.flatMap(s => s.assigneeId ? [s.assigneeId] : []) } }, select: { id: true, fullName: true } })).map(p => [p.id, p.fullName]));
  const now = Date.now();
  const queue: QueueItem[] = items.map(item => {
    const state = byKey.get(item.key);
    const overdue = item.dueAt !== null && Date.parse(item.dueAt) < now;
    const snoozed = Boolean(state?.snoozedUntil && state.snoozedUntil.getTime() > now);
    return { ...item, overdue, reason: reasonFor(item, overdue, now), assignee: state?.assigneeId ? { id: state.assigneeId, name: people.get(state.assigneeId) ?? "" } : null, acknowledgedAt: state?.acknowledgedAt?.toISOString() ?? null, snoozedUntil: snoozed ? state!.snoozedUntil!.toISOString() : null, snoozeReason: snoozed ? state!.snoozeReason : null, snoozed, version: state?.version ?? 0 };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || RANK[a.type] - RANK[b.type] || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const resolved = await prisma.queueItemState.findMany({ where: { schoolId: user.schoolId, campusId, resolvedAt: { gte: new Date(now - 14 * 86_400_000) } }, orderBy: { resolvedAt: "desc" }, take: 50, select: { itemKey: true, title: true, resolvedAt: true } });
  return {
    viewerId: user.userId, items: queue, resolved: resolved.map(r => ({ key: r.itemKey, title: r.title, resolvedAt: r.resolvedAt!.toISOString() })),
    counts: { active: queue.filter(i => !i.snoozed).length, overdue: queue.filter(i => i.overdue).length, snoozed: queue.filter(i => i.snoozed).length, unassigned: queue.filter(i => !i.assignee && !i.sourceOwner).length },
    failedSources: failed, checkedAt, sortingRule: SORTING_RULE,
  };
}

export async function history(user: AuthUser, campusId: string, key: string) {
  assertQueueAccess(user);
  return prisma.queueItemEvent.findMany({ where: { schoolId: user.schoolId, campusId, itemKey: key }, orderBy: { createdAt: "asc" } });
}

type ActInput = { action: string; keys?: unknown; assigneeId?: unknown; until?: unknown; reason?: unknown };
/** Assign / acknowledge / snooze / unsnooze one or more items, with a per-item outcome. Only items whose
 *  source condition is currently true can be acted on; a stale key reports "resolved" and changes nothing. */
export async function act(user: AuthUser, campusId: string, input: ActInput) {
  assertQueueAccess(user);
  const keys = Array.isArray(input.keys) ? [...new Set(input.keys.map(String))].slice(0, 100) : [];
  if (!keys.length) throw new ApiError("Choose at least one item.", 400);
  if (!["assign", "acknowledge", "snooze", "unsnooze"].includes(input.action)) throw new ApiError("Unknown action", 400);
  let assigneeId: string | null = null, until: Date | null = null, reason: string | null = null;
  if (input.action === "assign") {
    assigneeId = input.assigneeId ? String(input.assigneeId) : null;
    if (assigneeId) {
      const person = await prisma.user.findFirst({ where: { id: assigneeId, schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT", "APP_OWNER"] as never[] }, OR: [{ campusId }, { role: "SUPER_ADMIN" }] }, select: { id: true } });
      if (!person) throw new ApiError("Choose an active staff member in this campus.", 400);
    }
  }
  if (input.action === "snooze") {
    reason = String(input.reason ?? "").trim();
    if (reason.length < 5 || reason.length > 300) throw new ApiError("Say why you are snoozing (5–300 characters).", 400);
    until = new Date(String(input.until ?? ""));
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > Date.now() + 14 * 86_400_000) throw new ApiError("Choose a return time within the next 14 days.", 400);
  }
  const { items } = await collectSources(user, campusId);
  const current = new Map(items.map(item => [item.key, item]));
  const outcomes: { key: string; outcome: "updated" | "unchanged" | "resolved" }[] = [];
  for (const key of keys) {
    const item = current.get(key);
    if (!item) { outcomes.push({ key, outcome: "resolved" }); continue; }
    const changed = await schoolAiTransaction(user, async db => {
      const existing = await db.queueItemState.findUnique({ where: { campusId_itemKey: { campusId, itemKey: key } } });
      const data = input.action === "assign" ? { assigneeId }
        : input.action === "acknowledge" ? { acknowledgedAt: existing?.acknowledgedAt ?? new Date(), acknowledgedById: existing?.acknowledgedById ?? user.userId }
        : input.action === "snooze" ? { snoozedUntil: until, snoozeReason: reason }
        : { snoozedUntil: null, snoozeReason: null };
      const same = existing && (
        (input.action === "assign" && existing.assigneeId === assigneeId) ||
        (input.action === "acknowledge" && existing.acknowledgedAt) ||
        (input.action === "unsnooze" && !existing.snoozedUntil));
      if (same) return false;
      await db.queueItemState.upsert({ where: { campusId_itemKey: { campusId, itemKey: key } }, create: { schoolId: user.schoolId, campusId, itemKey: key, title: item.title, ...data }, update: { ...data, title: item.title, resolvedAt: null, version: { increment: 1 } } });
      await db.queueItemEvent.create({ data: { schoolId: user.schoolId, campusId, itemKey: key, kind: input.action === "assign" ? "ASSIGNED" : input.action === "acknowledge" ? "ACKNOWLEDGED" : input.action === "snooze" ? "SNOOZED" : "UNSNOOZED", assigneeId, snoozedUntil: until, note: reason, actorId: user.userId } });
      return true;
    });
    outcomes.push({ key, outcome: changed ? "updated" : "unchanged" });
  }
  return outcomes;
}

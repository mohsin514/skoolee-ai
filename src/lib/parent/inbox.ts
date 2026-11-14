import { prisma } from "@/lib/db/prisma";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { publishedReportsWhere } from "@/lib/auth/policy";
import { currentGuardianPermissionsByStudent, type GuardianPermissions } from "@/lib/parent/guardian-access";
import { EXPLAIN_WINDOW_DAYS } from "@/lib/attendance/rule";
import { guardianTrips } from "@/lib/family/trips";
import { familyExamBriefs } from "@/lib/academic/exam-brief";

// SKO-419: the family action inbox. One list across every child the guardian is verified for, each item
// read from its own source under that child's current permissions (they can differ per sibling). Every
// item names the child and the school before anything else. States come from the source: reading an
// item never completes it, completion is whatever the source records (an explanation decided, an
// invoice paid), and work done by another authorized guardian shows as completed with who did it.
// A single-child link resolves to that child only and never lists siblings.

export type InboxState = "ACTION" | "WAITING" | "COMPLETED" | "EXPIRED" | "UPDATE";
export type InboxItem = {
  id: string; kind: "EXPLAIN_ABSENCE" | "CLARIFY_ABSENCE" | "PAY_FEE" | "FEEDBACK_RETURNED" | "REPORT_PUBLISHED" | "RESULT_NOTE" | "EXAM_CHANGED" | "TRIP_CONSENT" | "LEAVE_REQUEST" | "MEETING_ACTION" | "MEETING_RESCHEDULE";
  state: InboxState; childId: string; childName: string; schoolName: string; campusName: string;
  title: string; detail: string | null; dueAt: string | null; overdue: boolean; at: string; href: string;
  completedByOther: boolean; receipt: string | null; timezone: string;
};

const DAY = 86_400_000;

type Child = { id: string; fullName: string; campusId: string; classId: string; campus: { name: string; school: { name: string } } };

type Granted = { child: Child; permissions: GuardianPermissions };
type Locale = Awaited<ReturnType<typeof getLocalePackage>>;
const sinceFor = (timezone: string, now: Date) => new Date(new Date(`${calendarDateIn(timezone, now)}T00:00:00Z`).getTime() - 30 * DAY);

/**
 * SKAI-1976: each source is read once for every child allowed to see it (studentId IN those children), not once
 * per child. Every read keeps schoolId and its filters; a capped source is cut per child in memory, so one sibling
 * never crowds out another. A read that fails marks only the children it covered as unavailable.
 */
async function readSources(guardianUserId: string, schoolId: string, granted: Granted[], locales: Map<string, Locale>, now: Date, failed: Set<string>) {
  const allowed = (flag: "attendance" | "communication" | "finances" | "learningRecords") => granted.filter(g => g.permissions[flag]).map(g => g.child.id);
  const attendanceIds = allowed("attendance"), communicationIds = guardianUserId ? allowed("communication") : [], financeIds = allowed("finances"), learningIds = allowed("learningRecords");
  // One child reads exactly as before (studentId = id, same take); siblings read together and are capped per child below.
  const student = (ids: string[]) => ids.length === 1 ? ids[0] : { in: ids };
  const cap = (ids: string[], take: number) => ids.length === 1 ? take : undefined;
  const guard = <T>(ids: string[], fallback: T, read: () => Promise<T>): Promise<T> => ids.length ? Promise.resolve().then(read).catch(error => {
    console.error("[family-inbox] a source could not be read for these children", error);
    for (const id of ids) failed.add(id);
    return fallback;
  }) : Promise.resolve(fallback);
  // Each child's attendance window starts 30 days before its own campus's today; read from the earliest, trim per child.
  const since = new Date(Math.min(...granted.filter(g => g.permissions.attendance).map(g => sinceFor(locales.get(g.child.campusId)!.timezone, now).getTime())));
  const [rows, leave, trips, moves, actions, invoices, reports, feedback, notes, briefs] = await Promise.all([
    guard(attendanceIds, [], () => prisma.attendance.findMany({ where: { schoolId, studentId: student(attendanceIds), status: { in: ["ABSENT", "LATE", "EXCUSED"] }, date: { gte: since } }, select: { id: true, studentId: true, date: true, status: true, explanations: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, submittedById: true, reviewNote: true, reviewedAt: true, createdAt: true } } }, orderBy: { date: "desc" } })),
    guard(attendanceIds, [], () => prisma.learnerLeaveRequest.findMany({ where: { schoolId, studentId: student(attendanceIds), status: { not: "CANCELLED" }, toDate: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { id: true, studentId: true, fromDate: true, toDate: true, status: true, reviewNote: true, requestedById: true, createdAt: true, reviewedAt: true }, orderBy: { fromDate: "asc" } })),
    guard(granted.map(g => g.child.id), [], () => guardianTrips(guardianUserId, schoolId, granted.map(g => g.child.id), now)),
    guard(communicationIds, [], () => prisma.meetingBooking.findMany({ where: { schoolId, studentId: student(communicationIds), guardianUserId, status: "RESCHEDULE_NEEDED" }, select: { id: true, studentId: true, startsAt: true, updatedAt: true } })),
    guard(communicationIds, [], () => prisma.meetingAction.findMany({ where: { schoolId, studentId: student(communicationIds), ownerRole: "FAMILY", ownerUserId: guardianUserId, booking: { followUp: { sharedAt: { not: null } } }, OR: [{ status: "OPEN" }, { completedAt: { gte: new Date(now.getTime() - 30 * DAY) } }] }, select: { id: true, studentId: true, text: true, dueDate: true, status: true, completedAt: true, createdAt: true }, orderBy: { dueDate: "asc" }, take: cap(communicationIds, 10) })),
    guard(financeIds, [], () => prisma.invoice.findMany({ where: { schoolId, studentId: student(financeIds), status: { not: "CANCELLED" }, OR: [{ balanceDue: { gt: 0 } }, { status: "PAID", generatedAt: { gte: new Date(now.getTime() - 60 * DAY) } }] }, select: { id: true, studentId: true, invoiceNumber: true, dueDate: true, balanceDue: true, currency: true, status: true, generatedAt: true }, orderBy: { dueDate: "asc" }, take: cap(financeIds, 20) })),
    guard(learningIds, [], () => prisma.reportCard.findMany({ where: { schoolId, studentId: student(learningIds), ...publishedReportsWhere, generatedAt: { gte: new Date(now.getTime() - 45 * DAY) } }, select: { id: true, studentId: true, generatedAt: true, exam: { select: { title: true } } }, orderBy: { generatedAt: "desc" }, take: cap(learningIds, 5) })),
    guard(learningIds, [], () => prisma.assignmentFeedback.findMany({ where: { schoolId, status: "RETURNED", returnedAt: { gte: new Date(now.getTime() - 30 * DAY) }, submissionVersion: { studentId: student(learningIds) } }, select: { id: true, returnedAt: true, submissionVersion: { select: { studentId: true, assignmentId: true, submission: { select: { assignment: { select: { title: true } } } } } } }, orderBy: { returnedAt: "desc" }, take: cap(learningIds, 5) })),
    // SKO-504: a sent family note (one sentence, already in this guardian's language).
    guard(learningIds, [], () => prisma.familyResultNote.findMany({ where: { schoolId, studentId: student(learningIds), status: "SENT", sentAt: { gte: new Date(now.getTime() - 45 * DAY) } }, select: { id: true, studentId: true, sentence: true, sentAt: true }, orderBy: { sentAt: "desc" }, take: cap(learningIds, 5) })),
    guard(learningIds, new Map() as Awaited<ReturnType<typeof familyExamBriefs>>, () => familyExamBriefs(schoolId, granted.filter(g => g.permissions.learningRecords).map(g => g.child), guardianUserId, now)),
  ]);
  const of = <T extends { studentId: string }>(list: T[], id: string, take?: number) => { const own = list.filter(row => row.studentId === id); return take ? own.slice(0, take) : own; };
  return (child: Child) => {
    const childSince = sinceFor(locales.get(child.campusId)!.timezone, now);
    return {
      rows: of(rows, child.id).filter(row => row.date >= childSince), leave: of(leave, child.id), trips: of(trips, child.id),
      meetings: [of(moves, child.id), of(actions, child.id, 10)] as const, invoices: of(invoices, child.id, 20),
      learning: [of(reports, child.id, 5), feedback.filter(row => row.submissionVersion.studentId === child.id).slice(0, 5), of(notes, child.id, 5)] as const,
      briefs: briefs.get(child.id) ?? [],
    };
  };
}

function itemsFor(guardianUserId: string, child: Child, permissions: GuardianPermissions, linkQuery: string, now: Date, locale: Locale, sources: ReturnType<Awaited<ReturnType<typeof readSources>>>): InboxItem[] {
  const base = { childId: child.id, childName: child.fullName, schoolName: child.campus.school.name, campusName: child.campus.name, timezone: locale.timezone };
  const items: InboxItem[] = [];
  const today = calendarDateIn(locale.timezone, now);
  const { rows, leave, trips, invoices, briefs } = sources;
  // Items are added in the same order as before, so the inbox's tie order is unchanged.
  const meetings = permissions.communication && guardianUserId ? sources.meetings : null;
  const learning = permissions.learningRecords ? sources.learning : null;

  if (permissions.attendance) {
    for (const row of rows) {
      const day = row.date.toISOString().slice(0, 10), explanation = row.explanations[0];
      const closes = new Date(new Date(`${day}T00:00:00Z`).getTime() + (EXPLAIN_WINDOW_DAYS + 1) * DAY);
      const href = `/parent/attendance${linkQuery}`;
      const common = { ...base, at: row.date.toISOString(), href, dueAt: closes.toISOString(), overdue: false };
      if (!explanation) {
        if (row.status === "EXCUSED") continue;
        items.push({ ...common, id: `attendance:${row.id}`, kind: "EXPLAIN_ABSENCE", state: now > closes ? "EXPIRED" : "ACTION", title: row.status === "LATE" ? "LATE" : "ABSENT", detail: day, completedByOther: false, receipt: null });
      } else if (explanation.status === "CLARIFICATION") {
        items.push({ ...common, id: `attendance:${row.id}`, kind: "CLARIFY_ABSENCE", state: "ACTION", title: row.status, detail: explanation.reviewNote, completedByOther: explanation.submittedById !== guardianUserId, receipt: null });
      } else if (explanation.status === "PENDING") {
        items.push({ ...common, id: `attendance:${row.id}`, kind: "EXPLAIN_ABSENCE", state: "WAITING", title: row.status, detail: day, completedByOther: explanation.submittedById !== guardianUserId, receipt: explanation.id });
      } else {
        items.push({ ...common, id: `attendance:${row.id}`, kind: "EXPLAIN_ABSENCE", state: "COMPLETED", title: explanation.status, detail: explanation.reviewNote ?? day, completedByOther: explanation.submittedById !== guardianUserId, receipt: explanation.id, at: (explanation.reviewedAt ?? explanation.createdAt).toISOString() });
      }
    }
  }

  // SKO-421: the family's own leave requests, in the school's decision state.
  if (permissions.attendance) {
    for (const row of leave) items.push({ ...base, id: `leave:${row.id}`, kind: "LEAVE_REQUEST", state: row.status === "CLARIFICATION" ? "ACTION" : row.status === "PENDING" ? "WAITING" : "COMPLETED", title: row.status, detail: `${row.fromDate.toISOString().slice(0, 10)}–${row.toDate.toISOString().slice(0, 10)}`, dueAt: null, overdue: false, at: (row.reviewedAt ?? row.createdAt).toISOString(), href: `/parent/attendance${linkQuery}`, completedByOther: Boolean(guardianUserId) && row.requestedById !== guardianUserId, receipt: null });
  }

  // SKO-421: trip permission, answered for one exact version under the trip's signatory rule.
  for (const trip of trips) {
    const mine = trip.myAnswer;
    const state: InboxState = !trip.canSign ? "UPDATE" : mine ? (trip.status === "PARTIAL" ? "WAITING" : "COMPLETED") : trip.deadlinePassed ? "EXPIRED" : "ACTION";
    items.push({ ...base, id: `trip:${trip.tripId}:${child.id}`, kind: "TRIP_CONSENT", state, title: trip.version.title, detail: `v${trip.version.version}${trip.earlierAnswer ? " · changed" : ""}`, dueAt: trip.version.respondBy.toISOString(), overdue: false, at: trip.version.publishedAt.toISOString(), href: `/parent/activities${linkQuery}`, completedByOther: !mine && trip.answeredByOther, receipt: mine?.receiptCode ?? null });
  }

  // SKO-420: meetings that need a new time, and shared follow-up actions this family owns.
  if (meetings) {
    const [moves, actions] = meetings;
    for (const row of moves) items.push({ ...base, id: `meeting:${row.id}`, kind: "MEETING_RESCHEDULE", state: "ACTION", title: "MEETING", detail: null, dueAt: row.startsAt.toISOString(), overdue: false, at: row.updatedAt.toISOString(), href: `/parent/meetings${linkQuery}`, completedByOther: false, receipt: null });
    for (const row of actions) items.push({ ...base, id: `meeting-action:${row.id}`, kind: "MEETING_ACTION", state: row.status === "DONE" ? "COMPLETED" : "ACTION", title: row.text, detail: row.dueDate, dueAt: `${row.dueDate}T23:59:59Z`, overdue: row.status !== "DONE" && row.dueDate < today, at: (row.completedAt ?? row.createdAt).toISOString(), href: `/parent/meetings${linkQuery}`, completedByOther: false, receipt: null });
  }

  if (permissions.finances) {
    for (const invoice of invoices) {
      const paid = invoice.balanceDue <= 0 || invoice.status === "PAID";
      const dueDay = calendarDateIn(locale.timezone, invoice.dueDate);
      items.push({ ...base, id: `invoice:${invoice.id}`, kind: "PAY_FEE", state: paid ? "COMPLETED" : "ACTION", title: invoice.invoiceNumber ?? "", detail: paid ? null : `${invoice.currency} ${invoice.balanceDue}`, dueAt: invoice.dueDate.toISOString(), overdue: !paid && dueDay < today, at: invoice.generatedAt.toISOString(), href: `/parent/fees${linkQuery}`, completedByOther: false, receipt: paid ? invoice.invoiceNumber : null });
    }
  }

  if (learning) {
    const [reports, feedback, notes] = learning;
    // SKO-505 Family Exam Brief: a republished date sheet that changed this child's papers, to acknowledge once.
    // `title` is the first changed subject; `detail` is "<kind>|<date>|<further changes>" for the reader's language.
    for (const brief of briefs) {
      const first = brief.items[0];
      items.push({ ...base, id: `exam-change:${brief.versionId}:${child.id}`, kind: "EXAM_CHANGED", state: brief.acknowledgedAt ? "COMPLETED" : "ACTION", title: first.subject, detail: `${first.kind}|${first.date ?? first.previousDate ?? ""}|${brief.items.length - 1}`, dueAt: null, overdue: false, at: brief.publishedAt.toISOString(), href: `/parent/timetable${linkQuery}`, completedByOther: false, receipt: brief.versionId });
    }
    for (const note of notes) items.push({ ...base, id: `result-note:${note.id}`, kind: "RESULT_NOTE", state: "UPDATE", title: note.sentence, detail: null, dueAt: null, overdue: false, at: note.sentAt!.toISOString(), href: `/parent/results${linkQuery}`, completedByOther: false, receipt: null });
    for (const report of reports) items.push({ ...base, id: `report:${report.id}`, kind: "REPORT_PUBLISHED", state: "UPDATE", title: report.exam.title, detail: null, dueAt: null, overdue: false, at: report.generatedAt.toISOString(), href: `/parent/results${linkQuery}`, completedByOther: false, receipt: null });
    for (const row of feedback) items.push({ ...base, id: `feedback:${row.id}`, kind: "FEEDBACK_RETURNED", state: "UPDATE", title: row.submissionVersion.submission.assignment.title, detail: null, dueAt: null, overdue: false, at: row.returnedAt!.toISOString(), href: `/parent/assignments${linkQuery}`, completedByOther: false, receipt: null });
  }
  return items;
}

const ORDER: Record<InboxState, number> = { ACTION: 0, WAITING: 1, UPDATE: 2, COMPLETED: 3, EXPIRED: 4 };

/** The inbox for a signed-in guardian (all verified children) or a single-child link (that child only). */
export async function familyInbox(input: { guardianUserId: string | null; schoolId: string; children: { id: string }[]; singleStudentId: string | null; tokenPermissions?: GuardianPermissions; linkQuery: (childId: string) => string }, now = new Date()) {
  const ids = input.singleStudentId ? [input.singleStudentId] : input.children.map(c => c.id);
  const children = await prisma.student.findMany({ where: { schoolId: input.schoolId, id: { in: ids }, archivedAt: null }, select: { id: true, fullName: true, campusId: true, classId: true, campus: { select: { name: true, school: { select: { name: true } } } } }, orderBy: [{ fullName: "asc" }] });
  // Permissions are read per child on every request: a sibling's grants never carry over.
  let groups: { child: Child; items: InboxItem[]; error: boolean }[];
  try {
    const grants = input.tokenPermissions ? new Map(children.map(c => [c.id, input.tokenPermissions!])) : input.guardianUserId ? await currentGuardianPermissionsByStudent({ schoolId: input.schoolId, studentIds: children.map(c => c.id), guardianUserId: input.guardianUserId, at: now }) : new Map<string, GuardianPermissions>();
    const failed = new Set<string>();
    // The locale is read once per campus, not once per child.
    const campusIds = [...new Set(children.filter(c => grants.has(c.id)).map(c => c.campusId))];
    const locales = new Map<string, Locale>();
    await Promise.all(campusIds.map(campusId => getLocalePackage(input.schoolId, campusId, now).then(locale => { locales.set(campusId, locale); }, error => {
      console.error("[family-inbox] a campus's locale could not be read", error);
      for (const c of children) if (c.campusId === campusId) failed.add(c.id);
    })));
    const granted = children.filter(c => grants.has(c.id) && !failed.has(c.id)).map(child => ({ child, permissions: grants.get(child.id)! }));
    const sourcesFor = granted.length ? await readSources(input.guardianUserId ?? "", input.schoolId, granted, locales, now, failed) : null;
    groups = children.map(child => {
      const permissions = grants.get(child.id);
      if (failed.has(child.id)) return { child, items: [], error: true };
      if (!permissions || !sourcesFor) return { child, items: [], error: false };
      return { child, items: itemsFor(input.guardianUserId ?? "", child, permissions, input.linkQuery(child.id), now, locales.get(child.campusId)!, sourcesFor(child)), error: false };
    });
  } catch (error) {
    console.error("[family-inbox] the children's actions could not be read", error);
    groups = children.map(child => ({ child, items: [], error: true }));
  }
  const items = groups.flatMap(g => g.items).sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.state === "ACTION" ? (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") : b.at.localeCompare(a.at)));
  return {
    children: children.map(c => ({ id: c.id, name: c.fullName, schoolName: c.campus.school.name, campusName: c.campus.name })),
    unavailable: groups.filter(g => g.error).map(g => g.child.id),
    counts: { action: items.filter(i => i.state === "ACTION").length, waiting: items.filter(i => i.state === "WAITING").length, completed: items.filter(i => i.state === "COMPLETED").length },
    items,
    refreshedAt: now.toISOString(),
  };
}

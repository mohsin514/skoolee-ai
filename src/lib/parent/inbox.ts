import { prisma } from "@/lib/db/prisma";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { publishedReportsWhere } from "@/lib/auth/policy";
import { currentGuardianRelationship, type GuardianPermissions } from "@/lib/parent/guardian-access";
import { EXPLAIN_WINDOW_DAYS } from "@/lib/attendance/rule";
import { guardianTrips } from "@/lib/family/trips";

// SKO-419: the family action inbox. One list across every child the guardian is verified for, each item
// read from its own source under that child's current permissions (they can differ per sibling). Every
// item names the child and the school before anything else. States come from the source: reading an
// item never completes it, completion is whatever the source records (an explanation decided, an
// invoice paid), and work done by another authorized guardian shows as completed with who did it.
// A single-child link resolves to that child only and never lists siblings.

export type InboxState = "ACTION" | "WAITING" | "COMPLETED" | "EXPIRED" | "UPDATE";
export type InboxItem = {
  id: string; kind: "EXPLAIN_ABSENCE" | "CLARIFY_ABSENCE" | "PAY_FEE" | "FEEDBACK_RETURNED" | "REPORT_PUBLISHED" | "TRIP_CONSENT" | "LEAVE_REQUEST";
  state: InboxState; childId: string; childName: string; schoolName: string; campusName: string;
  title: string; detail: string | null; dueAt: string | null; overdue: boolean; at: string; href: string;
  completedByOther: boolean; receipt: string | null; timezone: string;
};

const DAY = 86_400_000;

type Child = { id: string; fullName: string; campusId: string; campus: { name: string; school: { name: string } } };

async function itemsFor(guardianUserId: string, schoolId: string, child: Child, permissions: GuardianPermissions, linkQuery: string, now: Date): Promise<InboxItem[]> {
  const locale = await getLocalePackage(schoolId, child.campusId, now);
  const base = { childId: child.id, childName: child.fullName, schoolName: child.campus.school.name, campusName: child.campus.name, timezone: locale.timezone };
  const items: InboxItem[] = [];
  const today = calendarDateIn(locale.timezone, now);

  if (permissions.attendance) {
    const since = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * DAY);
    const rows = await prisma.attendance.findMany({ where: { schoolId, studentId: child.id, status: { in: ["ABSENT", "LATE", "EXCUSED"] }, date: { gte: since } }, select: { id: true, date: true, status: true, explanations: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, submittedById: true, reviewNote: true, reviewedAt: true, createdAt: true } } }, orderBy: { date: "desc" } });
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
    const leave = await prisma.learnerLeaveRequest.findMany({ where: { schoolId, studentId: child.id, status: { not: "CANCELLED" }, toDate: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { id: true, fromDate: true, toDate: true, status: true, reviewNote: true, requestedById: true, createdAt: true, reviewedAt: true }, orderBy: { fromDate: "asc" } });
    for (const row of leave) items.push({ ...base, id: `leave:${row.id}`, kind: "LEAVE_REQUEST", state: row.status === "CLARIFICATION" ? "ACTION" : row.status === "PENDING" ? "WAITING" : "COMPLETED", title: row.status, detail: `${row.fromDate.toISOString().slice(0, 10)}–${row.toDate.toISOString().slice(0, 10)}`, dueAt: null, overdue: false, at: (row.reviewedAt ?? row.createdAt).toISOString(), href: `/parent/attendance${linkQuery}`, completedByOther: Boolean(guardianUserId) && row.requestedById !== guardianUserId, receipt: null });
  }

  // SKO-421: trip permission, answered for one exact version under the trip's signatory rule.
  for (const trip of await guardianTrips(guardianUserId, schoolId, [child.id], now)) {
    const mine = trip.myAnswer;
    const state: InboxState = !trip.canSign ? "UPDATE" : mine ? (trip.status === "PARTIAL" ? "WAITING" : "COMPLETED") : trip.deadlinePassed ? "EXPIRED" : "ACTION";
    items.push({ ...base, id: `trip:${trip.tripId}:${child.id}`, kind: "TRIP_CONSENT", state, title: trip.version.title, detail: `v${trip.version.version}${trip.earlierAnswer ? " · changed" : ""}`, dueAt: trip.version.respondBy.toISOString(), overdue: false, at: trip.version.publishedAt.toISOString(), href: `/parent/attendance${linkQuery}`, completedByOther: !mine && trip.answeredByOther, receipt: mine?.receiptCode ?? null });
  }

  if (permissions.finances) {
    const invoices = await prisma.invoice.findMany({ where: { schoolId, studentId: child.id, status: { not: "CANCELLED" }, OR: [{ balanceDue: { gt: 0 } }, { status: "PAID", generatedAt: { gte: new Date(now.getTime() - 60 * DAY) } }] }, select: { id: true, invoiceNumber: true, dueDate: true, balanceDue: true, currency: true, status: true, generatedAt: true }, orderBy: { dueDate: "asc" }, take: 20 });
    for (const invoice of invoices) {
      const paid = invoice.balanceDue <= 0 || invoice.status === "PAID";
      const dueDay = calendarDateIn(locale.timezone, invoice.dueDate);
      items.push({ ...base, id: `invoice:${invoice.id}`, kind: "PAY_FEE", state: paid ? "COMPLETED" : "ACTION", title: invoice.invoiceNumber ?? "", detail: paid ? null : `${invoice.currency} ${invoice.balanceDue}`, dueAt: invoice.dueDate.toISOString(), overdue: !paid && dueDay < today, at: invoice.generatedAt.toISOString(), href: `/parent/fees${linkQuery}`, completedByOther: false, receipt: paid ? invoice.invoiceNumber : null });
    }
  }

  if (permissions.learningRecords) {
    const [reports, feedback] = await Promise.all([
      prisma.reportCard.findMany({ where: { schoolId, studentId: child.id, ...publishedReportsWhere, generatedAt: { gte: new Date(now.getTime() - 45 * DAY) } }, select: { id: true, generatedAt: true, exam: { select: { title: true } } }, orderBy: { generatedAt: "desc" }, take: 5 }),
      prisma.assignmentFeedback.findMany({ where: { schoolId, status: "RETURNED", returnedAt: { gte: new Date(now.getTime() - 30 * DAY) }, submissionVersion: { studentId: child.id } }, select: { id: true, returnedAt: true, submissionVersion: { select: { assignmentId: true, submission: { select: { assignment: { select: { title: true } } } } } } }, orderBy: { returnedAt: "desc" }, take: 5 }),
    ]);
    for (const report of reports) items.push({ ...base, id: `report:${report.id}`, kind: "REPORT_PUBLISHED", state: "UPDATE", title: report.exam.title, detail: null, dueAt: null, overdue: false, at: report.generatedAt.toISOString(), href: `/parent/results${linkQuery}`, completedByOther: false, receipt: null });
    for (const row of feedback) items.push({ ...base, id: `feedback:${row.id}`, kind: "FEEDBACK_RETURNED", state: "UPDATE", title: row.submissionVersion.submission.assignment.title, detail: null, dueAt: null, overdue: false, at: row.returnedAt!.toISOString(), href: `/parent/assignments${linkQuery}`, completedByOther: false, receipt: null });
  }
  return items;
}

const ORDER: Record<InboxState, number> = { ACTION: 0, WAITING: 1, UPDATE: 2, COMPLETED: 3, EXPIRED: 4 };

/** The inbox for a signed-in guardian (all verified children) or a single-child link (that child only). */
export async function familyInbox(input: { guardianUserId: string | null; schoolId: string; children: { id: string }[]; singleStudentId: string | null; tokenPermissions?: GuardianPermissions; linkQuery: (childId: string) => string }, now = new Date()) {
  const ids = input.singleStudentId ? [input.singleStudentId] : input.children.map(c => c.id);
  const children = await prisma.student.findMany({ where: { schoolId: input.schoolId, id: { in: ids }, archivedAt: null }, select: { id: true, fullName: true, campusId: true, campus: { select: { name: true, school: { select: { name: true } } } } }, orderBy: [{ fullName: "asc" }] });
  const groups = await Promise.all(children.map(async child => {
    try {
      // Permissions are checked per child on every read: a sibling's grants never carry over.
      const permissions = input.tokenPermissions ?? (input.guardianUserId ? (await currentGuardianRelationship({ schoolId: input.schoolId, studentId: child.id, guardianUserId: input.guardianUserId }))?.permissions : null);
      if (!permissions) return { child, items: [] as InboxItem[], error: false };
      return { child, items: await itemsFor(input.guardianUserId ?? "", input.schoolId, child, permissions, input.linkQuery(child.id), now), error: false };
    } catch (error) {
      console.error("[family-inbox] a child's actions could not be read", error);
      return { child, items: [] as InboxItem[], error: true };
    }
  }));
  const items = groups.flatMap(g => g.items).sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.state === "ACTION" ? (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") : b.at.localeCompare(a.at)));
  return {
    children: children.map(c => ({ id: c.id, name: c.fullName, schoolName: c.campus.school.name, campusName: c.campus.name })),
    unavailable: groups.filter(g => g.error).map(g => g.child.id),
    counts: { action: items.filter(i => i.state === "ACTION").length, waiting: items.filter(i => i.state === "WAITING").length, completed: items.filter(i => i.state === "COMPLETED").length },
    items,
    refreshedAt: now.toISOString(),
  };
}

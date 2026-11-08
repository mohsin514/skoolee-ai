import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { moduleFlags } from "@/lib/permissions";
import { requireMembership } from "@/lib/chat/membership";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { notificationHref, type NotificationLinkContext } from "@/lib/notifications/links";

// SKO-416: notifications point at a source record. Reading one is attention only; an ACTION is resolved
// when its source changes (a leave request is decided or cancelled), never by reading or "mark all read".
// Every list and every open rechecks that the viewer may still reach the source; when they may not, the
// stored title and text are withheld, so an old notification cannot leak what it once described.

export type SourceState = "open" | "resolved" | "unavailable";
export type SourceView = { state: SourceState; link: string | null; resolution?: string | null };
/** Leave reviewers (G41a: ADMIN is a campus operator like CAMPUS_ADMIN). */
const LEADERS = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"];
const CAMPUS_OPERATORS = ["CAMPUS_ADMIN", "ADMIN"];
/** Front office (C29, G40): the receptionist and the campus operators. The principal and the group admin are not. */
const FRONT_DESK = [...CAMPUS_OPERATORS, "RECEPTIONIST"];

async function canReviewLeave(user: AuthUser, db: TxClient) {
  if (!LEADERS.includes(user.role)) return false;
  const grants = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } });
  return moduleFlags(grants, user.role, "leave").canEdit;
}

type SourceRow = { type?: string | null; campusId?: string | null; sourceType: string | null; sourceId: string | null; link: string | null; category: string; resolvedAt: Date | null; resolution: string | null };

/** The reader's own route for this row (G41b): never the stored link when it was written for another console. */
function linkFor(user: AuthUser, row: SourceRow, extra: NotificationLinkContext = {}): string {
  const approvalKind = row.sourceType?.startsWith("self-approval:") ? row.sourceType.slice("self-approval:".length) : null;
  return notificationHref(user, row.type ?? "", {
    link: row.link,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    campusId: row.campusId ?? (row.sourceType === "campus" ? row.sourceId : null),
    approvalKind,
    ...extra,
  });
}

/** Current, permission-checked view of one notification's source. */
export async function sourceView(user: AuthUser, row: SourceRow, db: TxClient = prisma): Promise<SourceView> {
  if (!row.sourceType || !row.sourceId) return { state: row.resolvedAt ? "resolved" : "open", link: linkFor(user, row), resolution: row.resolution };
  if (row.sourceType === "leave") {
    const request = await db.leaveRequest.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, campusId: true } });
    if (!request || !(await canReviewLeave(user, db)) || (user.role !== "SUPER_ADMIN" && request.campusId !== user.campusId)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "LEAVE_APPLIED" });
    if (request.status !== "PENDING") return { state: "resolved", link, resolution: request.status === "CANCELLED" ? "CANCELLED" : "COMPLETED" };
    return { state: "open", link };
  }
  if (row.sourceType === "callback") {
    // SKO-465: the action is the owner's until the callback is completed or handed to someone else.
    const callback = await db.phoneCallback.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, ownerId: true, campusId: true } });
    if (!callback || callback.campusId !== user.campusId || !FRONT_DESK.includes(user.role)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "PHONE_CALLBACK_ASSIGNED" });
    if (callback.status !== "OPEN") return { state: "resolved", link, resolution: "COMPLETED" };
    if (callback.ownerId !== user.userId) return { state: "resolved", link, resolution: "REASSIGNED" };
    return { state: "open", link };
  }
  if (row.sourceType === "postal") {
    // SKO-464: open until the item is handed over or given to another owner.
    const item = await db.postalRecord.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, ownerId: true, campusId: true } });
    if (!item || item.campusId !== user.campusId || !FRONT_DESK.includes(user.role)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "POSTAL_ASSIGNED" });
    if (["COLLECTED", "DELIVERED"].includes(item.status)) return { state: "resolved", link, resolution: "COMPLETED" };
    if (item.ownerId !== user.userId) return { state: "resolved", link, resolution: "REASSIGNED" };
    return { state: "open", link };
  }
  if (row.sourceType === "certificate") {
    // SKO-469: an approval request is open until a campus operator approves or rejects it.
    const issue = await db.certificateIssue.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, campusId: true } });
    // Certificate approval is the campus operator's (§2.5): never the principal or the group admin.
    if (!issue || issue.campusId !== user.campusId || !CAMPUS_OPERATORS.includes(user.role)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "CERTIFICATE_APPROVAL_NEEDED" });
    return issue.status === "PENDING_APPROVAL" ? { state: "open", link } : { state: "resolved", link, resolution: "COMPLETED" };
  }
  if (row.sourceType === "application") {
    // SKO-398: open while the application is active and still owned by this reader.
    const application = await db.admissionApplication.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, ownerId: true, campusId: true } });
    if (!application || application.campusId !== user.campusId || !FRONT_DESK.includes(user.role)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "ADMISSION_APPLICATION_ASSIGNED" });
    if (["ENROLLED", "REJECTED", "DECLINED", "WITHDRAWN"].includes(application.status)) return { state: "resolved", link, resolution: application.status === "ENROLLED" ? "COMPLETED" : "CANCELLED" };
    if (application.ownerId !== user.userId) return { state: "resolved", link, resolution: "REASSIGNED" };
    return { state: "open", link };
  }
  if (row.sourceType === "correction") {
    // R-B2: open while the correction waits for its checker. PAYMENT is decided by a campus operator; MARK by the
    // academic lead (the principal, or a campus operator while the campus has none).
    const correction = await db.correction.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, campusId: true, kind: true } });
    const checker = correction?.kind === "MARK" ? [...CAMPUS_OPERATORS, "PRINCIPAL"] : CAMPUS_OPERATORS;
    if (!correction || correction.campusId !== user.campusId || !checker.includes(user.role)) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "CORRECTION_REQUESTED" }, { kind: correction.kind });
    if (correction.status === "PENDING") return { state: "open", link };
    return { state: "resolved", link, resolution: ["WITHDRAWN", "CANCELLED"].includes(correction.status) ? "CANCELLED" : "COMPLETED" };
  }
  if (row.sourceType === "campus") {
    // R-B3: the vacancy notice stays open until someone holds the campus-operator seat again.
    if (!isInstitutionAuthority(user)) return { state: "unavailable", link: null };
    const operators = await db.user.count({ where: { schoolId: user.schoolId, campusId: row.sourceId, isActive: true, role: { in: ["CAMPUS_ADMIN", "ADMIN"] } } });
    const link = linkFor(user, { ...row, type: row.type ?? "CAMPUS_OPS_VACANT" });
    return operators > 0 ? { state: "resolved", link, resolution: "COMPLETED" } : { state: row.resolvedAt ? "resolved" : "open", link, resolution: row.resolution };
  }
  if (row.sourceType === "tax-activation") {
    // §4.4b: a submitted tax package draft is open for the institution authority until it is approved or withdrawn.
    if (!isInstitutionAuthority(user)) return { state: "unavailable", link: null };
    const activation = await db.taxActivation.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true } });
    if (!activation) return { state: "unavailable", link: null };
    const link = linkFor(user, { ...row, type: row.type ?? "TAX_SIGNOFF_REQUESTED" });
    if (activation.status === "DRAFT") return { state: "open", link };
    return { state: "resolved", link, resolution: activation.status === "WITHDRAWN" ? "CANCELLED" : "COMPLETED" };
  }
  if (row.sourceType.startsWith("self-approval:")) {
    // R-B4: the SD3 audit notice (with the maker's reason) is for the institution authority only.
    if (!isInstitutionAuthority(user)) return { state: "unavailable", link: null };
    return { state: row.resolvedAt ? "resolved" : "open", link: linkFor(user, row), resolution: row.resolution };
  }
  if (row.sourceType === "chat") {
    try { await requireMembership(user, row.sourceId, db); }
    catch { return { state: "unavailable", link: null }; }
    return { state: row.resolvedAt ? "resolved" : "open", link: `/messages?c=${encodeURIComponent(row.sourceId)}` };
  }
  return { state: row.resolvedAt ? "resolved" : "open", link: linkFor(user, row), resolution: row.resolution };
}

/** Called by the source workflow when the underlying work is decided, withdrawn or reassigned. */
export async function resolveSourceActions(input: { schoolId: string; sourceType: string; sourceId: string; resolution: "COMPLETED" | "CANCELLED" | "REASSIGNED"; exceptUserIds?: string[] }, db: TxClient = prisma) {
  return db.notification.updateMany({
    where: { schoolId: input.schoolId, sourceType: input.sourceType, sourceId: input.sourceId, category: "ACTION", resolvedAt: null, ...(input.exceptUserIds?.length ? { userId: { notIn: input.exceptUserIds } } : {}) },
    data: { resolvedAt: new Date(), resolution: input.resolution },
  });
}

export const VIEWS = ["all", "mentions", "actions"] as const;
export type InboxView = typeof VIEWS[number];

const select = { id: true, type: true, campusId: true, title: true, message: true, icon: true, link: true, isRead: true, actorId: true, actorName: true, createdAt: true, category: true, sourceType: true, sourceId: true, dueAt: true, resolvedAt: true, resolution: true, reminderCount: true, lastRemindedAt: true } as const;
type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

export async function listInbox(user: AuthUser, options: { view: InboxView; status?: "open" | "resolved" | null; limit: number; cursor?: string; unreadOnly?: boolean }) {
  const where: Prisma.NotificationWhereInput = {
    userId: user.userId,
    ...(options.view === "mentions" ? { category: "MENTION" } : options.view === "actions" ? { category: "ACTION" } : {}),
    ...(options.view === "actions" && options.status === "open" ? { resolvedAt: null } : options.view === "actions" && options.status === "resolved" ? { resolvedAt: { not: null } } : {}),
    ...(options.unreadOnly ? { isRead: false } : {}),
  };
  const rows = await prisma.notification.findMany({ where, orderBy: [{ lastRemindedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: options.limit + 1, ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}), select });
  const page = rows.slice(0, options.limit);
  const now = Date.now();
  const items = await Promise.all(page.map(async row => present(user, row, now)));
  // Actions whose source was decided elsewhere are resolved here too, so every device converges.
  const settled = items.filter(item => item.category === "ACTION" && item.state === "resolved" && !item.resolvedAt);
  if (settled.length) await prisma.notification.updateMany({ where: { id: { in: settled.map(item => item.id) }, userId: user.userId, resolvedAt: null }, data: { resolvedAt: new Date(), resolution: "COMPLETED" } });
  return { items, nextCursor: rows.length > options.limit ? page[page.length - 1]?.id ?? null : null };
}

/** A row as the list or the open route selects it (the open route does not select `campusId`). */
type PresentRow = Omit<Row, "campusId"> & { campusId?: string | null };

export async function present(user: AuthUser, row: PresentRow, now = Date.now()) {
  // The open route selects no campusId; read it here so opening a row resolves the same link as the list (P9-14b:
  // SELF_APPROVED finance/purchase opened `/super?view=campuses` instead of that campus).
  const campusId = row.campusId !== undefined
    ? row.campusId
    : (await prisma.notification.findFirst({ where: { id: row.id, userId: user.userId }, select: { campusId: true } }))?.campusId ?? null;
  const view = await sourceView(user, { ...row, campusId });
  const hidden = view.state === "unavailable";
  return {
    ...row,
    title: hidden ? "No longer available" : row.title,
    message: hidden ? "You no longer have access to this item." : row.message,
    link: hidden ? null : view.link,
    actorId: hidden ? null : row.actorId,
    actorName: hidden ? null : row.actorName,
    sourceId: hidden ? null : row.sourceId,
    state: view.state,
    resolution: view.resolution ?? row.resolution,
    overdue: row.category === "ACTION" && view.state === "open" && row.dueAt !== null && row.dueAt.getTime() < now,
  };
}

/**
 * P9-02: a vacancy notice is resolved as soon as the campus has an operator again, not only when the authority opens
 * it, so "Needs you" counts converge without the appointing workflow having to know about notifications. Cheap: only
 * the authority holds such rows, and only their open ones are checked.
 */
export async function settleCampusVacancies(user: AuthUser, db: TxClient = prisma): Promise<number> {
  if (!isInstitutionAuthority(user)) return 0;
  const open = await db.notification.findMany({ where: { userId: user.userId, sourceType: "campus", category: "ACTION", resolvedAt: null }, select: { sourceId: true } });
  const campuses = [...new Set(open.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))];
  if (!campuses.length) return 0;
  const staffed = await db.user.groupBy({ by: ["campusId"], where: { schoolId: user.schoolId, campusId: { in: campuses }, isActive: true, role: { in: ["CAMPUS_ADMIN", "ADMIN"] } } });
  const filled = staffed.map((row) => row.campusId).filter((id): id is string => Boolean(id));
  if (!filled.length) return 0;
  const result = await db.notification.updateMany({
    where: { userId: user.userId, sourceType: "campus", sourceId: { in: filled }, category: "ACTION", resolvedAt: null },
    data: { resolvedAt: new Date(), resolution: "COMPLETED" },
  });
  return result.count;
}

/**
 * §4.4b: a tax sign-off request is resolved once its draft is approved or withdrawn, wherever that happened, so the
 * authority's "Needs you" count converges like the vacancy notice above. Only the authority holds such rows.
 */
export async function settleTaxSignoffs(user: AuthUser, db: TxClient = prisma): Promise<number> {
  if (!isInstitutionAuthority(user)) return 0;
  const open = await db.notification.findMany({ where: { userId: user.userId, sourceType: "tax-activation", category: "ACTION", resolvedAt: null }, select: { sourceId: true } });
  const ids = [...new Set(open.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  const decided = await db.taxActivation.findMany({ where: { schoolId: user.schoolId, id: { in: ids }, status: { not: "DRAFT" } }, select: { id: true, status: true } });
  let count = 0;
  for (const resolution of ["COMPLETED", "CANCELLED"] as const) {
    const sourceIds = decided.filter((row) => (row.status === "WITHDRAWN") === (resolution === "CANCELLED")).map((row) => row.id);
    if (!sourceIds.length) continue;
    const result = await db.notification.updateMany({
      where: { userId: user.userId, sourceType: "tax-activation", sourceId: { in: sourceIds }, category: "ACTION", resolvedAt: null },
      data: { resolvedAt: new Date(), resolution },
    });
    count += result.count;
  }
  return count;
}

export async function inboxCounts(user: AuthUser) {
  await settleCampusVacancies(user).catch((error) => console.error("[notifications] vacancy settle failed:", error));
  await settleTaxSignoffs(user).catch((error) => console.error("[notifications] tax sign-off settle failed:", error));
  const now = new Date();
  const [unread, mentionsUnread, openActions, overdueActions] = await Promise.all([
    prisma.notification.count({ where: { userId: user.userId, isRead: false } }),
    prisma.notification.count({ where: { userId: user.userId, isRead: false, category: "MENTION" } }),
    prisma.notification.count({ where: { userId: user.userId, category: "ACTION", resolvedAt: null } }),
    prisma.notification.count({ where: { userId: user.userId, category: "ACTION", resolvedAt: null, dueAt: { lt: now } } }),
  ]);
  return { unread, mentionsUnread, openActions, overdueActions };
}

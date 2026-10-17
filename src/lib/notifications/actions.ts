import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { moduleFlags } from "@/lib/permissions";
import { requireMembership } from "@/lib/chat/membership";

// SKO-416: notifications point at a source record. Reading one is attention only; an ACTION is resolved
// when its source changes (a leave request is decided or cancelled), never by reading or "mark all read".
// Every list and every open rechecks that the viewer may still reach the source; when they may not, the
// stored title and text are withheld, so an old notification cannot leak what it once described.

export type SourceState = "open" | "resolved" | "unavailable";
export type SourceView = { state: SourceState; link: string | null; resolution?: string | null };
const LEADERS = ["SUPER_ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const FRONT_DESK = [...LEADERS, "ADMIN", "RECEPTIONIST"];

async function canReviewLeave(user: AuthUser, db: TxClient) {
  if (!LEADERS.includes(user.role)) return false;
  const grants = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } });
  return moduleFlags(grants, user.role, "leave").canEdit;
}

/** Current, permission-checked view of one notification's source. */
export async function sourceView(user: AuthUser, row: { sourceType: string | null; sourceId: string | null; link: string | null; category: string; resolvedAt: Date | null; resolution: string | null }, db: TxClient = prisma): Promise<SourceView> {
  if (!row.sourceType || !row.sourceId) return { state: row.resolvedAt ? "resolved" : "open", link: row.link, resolution: row.resolution };
  if (row.sourceType === "leave") {
    const request = await db.leaveRequest.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, campusId: true } });
    if (!request || !(await canReviewLeave(user, db)) || (user.role !== "SUPER_ADMIN" && request.campusId !== user.campusId)) return { state: "unavailable", link: null };
    const link = user.role === "PRINCIPAL" ? "/principal?view=leave" : "/admin?view=leave";
    if (request.status !== "PENDING") return { state: "resolved", link, resolution: request.status === "CANCELLED" ? "CANCELLED" : "COMPLETED" };
    return { state: "open", link };
  }
  if (row.sourceType === "callback") {
    // SKO-465: the action is the owner's until the callback is completed or handed to someone else.
    const callback = await db.phoneCallback.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, ownerId: true, campusId: true } });
    if (!callback || (user.role !== "SUPER_ADMIN" && callback.campusId !== user.campusId) || !FRONT_DESK.includes(user.role)) return { state: "unavailable", link: null };
    const link = user.role === "RECEPTIONIST" ? "/receptionist?view=phone-calls" : user.role === "PRINCIPAL" ? "/principal?view=phone-calls" : "/admin?view=phone-calls";
    if (callback.status !== "OPEN") return { state: "resolved", link, resolution: "COMPLETED" };
    if (callback.ownerId !== user.userId) return { state: "resolved", link, resolution: "REASSIGNED" };
    return { state: "open", link };
  }
  if (row.sourceType === "postal") {
    // SKO-464: open until the item is handed over or given to another owner.
    const item = await db.postalRecord.findFirst({ where: { id: row.sourceId, schoolId: user.schoolId }, select: { status: true, ownerId: true, campusId: true } });
    if (!item || (user.role !== "SUPER_ADMIN" && item.campusId !== user.campusId) || !FRONT_DESK.includes(user.role)) return { state: "unavailable", link: null };
    const link = user.role === "RECEPTIONIST" ? "/receptionist?view=postal" : user.role === "PRINCIPAL" ? "/principal?view=postal" : "/admin?view=postal";
    if (["COLLECTED", "DELIVERED"].includes(item.status)) return { state: "resolved", link, resolution: "COMPLETED" };
    if (item.ownerId !== user.userId) return { state: "resolved", link, resolution: "REASSIGNED" };
    return { state: "open", link };
  }
  if (row.sourceType === "chat") {
    try { await requireMembership(user, row.sourceId, db); }
    catch { return { state: "unavailable", link: null }; }
    return { state: row.resolvedAt ? "resolved" : "open", link: `/messages?c=${encodeURIComponent(row.sourceId)}` };
  }
  return { state: row.resolvedAt ? "resolved" : "open", link: row.link, resolution: row.resolution };
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

const select = { id: true, type: true, title: true, message: true, icon: true, link: true, isRead: true, actorId: true, actorName: true, createdAt: true, category: true, sourceType: true, sourceId: true, dueAt: true, resolvedAt: true, resolution: true, reminderCount: true, lastRemindedAt: true } as const;
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

export async function present(user: AuthUser, row: Row, now = Date.now()) {
  const view = await sourceView(user, row);
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

export async function inboxCounts(user: AuthUser) {
  const now = new Date();
  const [unread, mentionsUnread, openActions, overdueActions] = await Promise.all([
    prisma.notification.count({ where: { userId: user.userId, isRead: false } }),
    prisma.notification.count({ where: { userId: user.userId, isRead: false, category: "MENTION" } }),
    prisma.notification.count({ where: { userId: user.userId, category: "ACTION", resolvedAt: null } }),
    prisma.notification.count({ where: { userId: user.userId, category: "ACTION", resolvedAt: null, dueAt: { lt: now } } }),
  ]);
  return { unread, mentionsUnread, openActions, overdueActions };
}

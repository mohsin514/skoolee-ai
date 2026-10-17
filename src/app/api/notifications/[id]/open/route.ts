import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { present } from "@/lib/notifications/actions";

// SKO-416: opening a notification rechecks the viewer's current access to its source, marks it read and
// returns where to go. It never completes the underlying work; an ACTION stays open until its source does.
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const row = await prisma.notification.findFirst({
      where: { id, userId: user.userId },
      select: { id: true, type: true, title: true, message: true, icon: true, link: true, isRead: true, actorId: true, actorName: true, createdAt: true, category: true, sourceType: true, sourceId: true, dueAt: true, resolvedAt: true, resolution: true, reminderCount: true, lastRemindedAt: true },
    });
    if (!row) return Response.json({ error: "Notification not found" }, { status: 404 });
    if (!row.isRead) await prisma.notification.update({ where: { id: row.id }, data: { isRead: true, readAt: new Date() } });
    const item = await present(user, { ...row, isRead: true });
    if (item.state === "resolved" && row.category === "ACTION" && !row.resolvedAt) await prisma.notification.update({ where: { id: row.id }, data: { resolvedAt: new Date(), resolution: item.resolution ?? "COMPLETED" } });
    return Response.json({ success: true, data: item }, { status: item.state === "unavailable" ? 403 : 200 });
  } catch (error) {
    console.error("[notifications] open failed:", error);
    return Response.json({ error: "Failed to open notification" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { inboxCounts, listInbox, VIEWS, type InboxView } from "@/lib/notifications/actions";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-416: ?view=all|mentions|actions&status=open|resolved. Items carry their current source state
// (open / resolved / unavailable) rechecked for this viewer; unavailable items show no stored text.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const rawLimit = searchParams.get("limit");
    const requestedLimit = rawLimit ? Number(rawLimit) : 20;
    // A non-positive or fractional limit must fail loudly: silently coercing it made an unread inbox look empty.
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return Response.json({ error: "limit must be a positive integer" }, { status: 400 });
    }
    const limit = Math.min(requestedLimit, 50);
    const cursor = searchParams.get("cursor") || undefined;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const view = (VIEWS as readonly string[]).includes(searchParams.get("view") ?? "") ? (searchParams.get("view") as InboxView) : "all";
    const status = searchParams.get("status") === "resolved" ? "resolved" : searchParams.get("status") === "open" ? "open" : null;

    const [{ items, nextCursor }, counts] = await Promise.all([
      listInbox(user, { view, status, limit, cursor, unreadOnly }),
      inboxCounts(user),
    ]);

    return Response.json({
      success: true,
      notifications: items,
      unreadCount: counts.unread,
      counts,
      nextCursor,
    });
  } catch (error) {
    console.error("[notifications] GET failed:", error);
    return Response.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await parseBody(req, jsonObjectBody);
    const now = new Date();

    // Marking read is attention only: it never resolves an assigned action (SKO-416).
    if (body.all === true) {
      const category = body.view === "mentions" ? "MENTION" : body.view === "actions" ? "ACTION" : body.view === "updates" ? "UPDATE" : undefined;
      const result = await prisma.notification.updateMany({
        where: { userId: user.userId, isRead: false, ...(category ? { category } : {}) },
        data: { isRead: true, readAt: now },
      });
      return Response.json({ success: true, readCount: result.count });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await prisma.notification.updateMany({
        where: { id: { in: body.ids }, userId: user.userId, isRead: false },
        data: { isRead: true, readAt: now },
      });
      return Response.json({ success: true, readCount: result.count });
    }

    return Response.json({ error: "Provide { all: true } or { ids: [...] }" }, { status: 400 });
  } catch (error) {
    console.error("[notifications] PATCH failed:", error);
    return Response.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

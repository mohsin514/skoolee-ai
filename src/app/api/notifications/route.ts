import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
    const cursor = searchParams.get("cursor") || undefined;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where: Record<string, unknown> = { userId: user.userId };
    if (unreadOnly) where.isRead = false;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        icon: true,
        link: true,
        isRead: true,
        actorId: true,
        actorName: true,
        createdAt: true,
      },
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const unreadCount = await prisma.notification.count({
      where: { userId: user.userId, isRead: false },
    });

    return Response.json({
      success: true,
      notifications: items,
      unreadCount,
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

    const body = await req.json();
    const now = new Date();

    if (body.all === true) {
      const result = await prisma.notification.updateMany({
        where: { userId: user.userId, isRead: false },
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

import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/queue/connection";
import { NOTIFICATION_EVENTS, type NotificationEventPayload } from "./events";

export function notify(eventType: string, payload: NotificationEventPayload): void {
  _notifyAsync(eventType, payload).catch((err) => {
    console.error(`[notify] ${eventType} failed:`, err);
  });
}

async function _notifyAsync(eventType: string, payload: NotificationEventPayload): Promise<void> {
  const eventDef = NOTIFICATION_EVENTS[eventType];
  if (!eventDef) {
    console.warn(`[notify] Unknown event type: ${eventType}`);
    return;
  }

  const recipientIds = await eventDef.recipients(payload);

  const filtered = recipientIds.filter((id) => id !== payload.actorId);
  if (filtered.length === 0) return;

  const ctx: Record<string, unknown> = { ...payload };
  const title = eventDef.title(ctx);
  const message = eventDef.message(ctx);

  const notifications = filtered.map((userId) => ({
    schoolId: payload.schoolId,
    campusId: payload.campusId ?? null,
    userId,
    type: eventType,
    title,
    message,
    icon: eventDef.icon || null,
    link: eventDef.link || null,
    actorId: payload.actorId ?? null,
    actorName: typeof payload.actorName === "string" ? payload.actorName : null,
  }));

  const created = await prisma.notification.createManyAndReturn({
    data: notifications,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      icon: true,
      link: true,
      actorId: true,
      actorName: true,
      isRead: true,
      createdAt: true,
    },
  });

  for (const notif of created) {
    redis
      .publish(`notif:${notif.userId}`, JSON.stringify(notif))
      .catch(() => {});
  }
}

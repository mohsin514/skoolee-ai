import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/queue/connection";
import { NOTIFICATION_EVENTS, type NotificationEventPayload } from "./events";

export function notify(eventType: string, payload: NotificationEventPayload): void {
  deliverNotification(eventType, payload).catch((err) => {
    console.error(`[notify] ${eventType} failed:`, err);
  });
}

/** Awaitable delivery; `notify` is the fire-and-forget wrapper request handlers use. */
export async function deliverNotification(eventType: string, payload: NotificationEventPayload): Promise<void> {
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

  const source = eventDef.source?.(ctx) ?? null;
  const dueAt = eventDef.dueAt?.(ctx) ?? null;
  // SKO-416: one row per user and source. A repeated event (duplicate delivery or a reminder) bumps the
  // existing row instead of adding another, and brings it back to unread with its own count.
  const dedupeKey = source ? `${eventType}:${source.type}:${source.id}` : null;

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
    category: eventDef.category ?? "UPDATE",
    sourceType: source?.type ?? null,
    sourceId: source?.id ?? null,
    dedupeKey,
    dueAt,
  }));

  const created = await prisma.notification.createManyAndReturn({
    data: notifications,
    skipDuplicates: true,
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
      category: true,
    },
  });
  if (dedupeKey) {
    const fresh = new Set(created.map((row) => row.userId));
    const repeated = filtered.filter((userId) => !fresh.has(userId));
    if (repeated.length) {
      await prisma.notification.updateMany({
        where: { userId: { in: repeated }, dedupeKey, resolvedAt: null },
        data: { reminderCount: { increment: 1 }, lastRemindedAt: new Date(), isRead: false, readAt: null, ...(dueAt ? { dueAt } : {}) },
      });
    }
  }

  for (const notif of created) {
    redis
      .publish(`notif:${notif.userId}`, JSON.stringify(notif))
      .catch(() => {});
  }
}

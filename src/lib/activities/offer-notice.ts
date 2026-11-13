import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { deliverNotification } from "@/lib/notifications/in-app";
import { guardianNoticeRecipients } from "./service";

export type ActivityNoticeEvent = "ACTIVITY_PLACE_OFFERED" | "ACTIVITY_CANCELLED";
export type ActivityNoticeResult = { notified: number; withheld: number };

/**
 * SKAI-1713: one place for activity notices. Recipients come from the communication policy at send time.
 * Every notice that the policy withholds from a guardian is audited with counts only (no content, names or
 * contact details). A failed delivery or audit is logged; the activity change already stands.
 */
export async function sendActivityNotice(user: AuthUser, event: ActivityNoticeEvent, studentIds: string[], recordId: string, scope: number): Promise<ActivityNoticeResult> {
  const { recipients, withheld } = await guardianNoticeRecipients(user.schoolId, studentIds);
  if (withheld) {
    await prisma.auditLog.create({ data: { schoolId: user.schoolId, campusId: user.campusId ?? null, tableName: "activity_notices", recordId, userId: user.userId, newValue: { event, scope, notified: recipients.length, withheld, reason: "communication_permission" } } })
      .catch(error => console.error("[activities] notice suppression audit failed", error));
  }
  if (recipients.length) await deliverNotification(event, { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId, recipientIds: recipients }).catch(error => console.error(`[activities] ${event} notice failed`, error));
  return { notified: recipients.length, withheld };
}

/**
 * SKO-440: tells the guardians of learners who were just offered a freed place. Kept apart from the
 * service (which sends no notifications) and shared by POST /api/activities, POST /api/family/activities and the
 * AI Workflows `family_activities.request_place` adapter, so all send the same notice after the same command.
 */
export async function notifyOfferedPlaces(user: AuthUser, placeIds: string[]): Promise<ActivityNoticeResult> {
  if (!placeIds.length) return { notified: 0, withheld: 0 };
  const places = await prisma.activityPlace.findMany({ where: { id: { in: placeIds } }, select: { studentId: true } });
  return sendActivityNotice(user, "ACTIVITY_PLACE_OFFERED", places.map(p => p.studentId), placeIds[0], placeIds.length);
}

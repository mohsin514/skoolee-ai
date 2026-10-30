import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { deliverNotification } from "@/lib/notifications/in-app";
import { guardiansOf } from "./service";

/**
 * SKO-440: tells the guardians of learners who were just offered a freed place. Kept apart from the
 * service (which sends no notifications) and shared by POST /api/family/activities and the AI Workflows
 * `family_activities.request_place` adapter, so both send the same notice after the same command.
 * A failed notice is logged; the place change already stands.
 */
export async function notifyOfferedPlaces(user: AuthUser, placeIds: string[]) {
  if (!placeIds.length) return;
  const places = await prisma.activityPlace.findMany({ where: { id: { in: placeIds } }, select: { studentId: true } });
  const recipients = await guardiansOf(user.schoolId, places.map(p => p.studentId));
  if (recipients.length) await deliverNotification("ACTIVITY_PLACE_OFFERED", { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId, recipientIds: recipients }).catch(error => console.error("[family/activities] offer notice failed", error));
}

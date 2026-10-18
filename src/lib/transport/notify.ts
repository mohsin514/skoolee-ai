import { deliverNotification } from "@/lib/notifications/in-app";

// SKO-437: transport notices, kept apart from the service so it never loads notifications (and Redis).
// A notice names no child; the trip page shows the exception to its owner.

export async function notifyException(base: { schoolId: string; campusId: string; actorId: string }, ownerId: string | null | undefined) {
  if (!ownerId || !base.campusId) return;
  await deliverNotification("TRANSPORT_EXCEPTION", { ...base, recipientIds: [ownerId] }).catch(error => console.error("[transport] TRANSPORT_EXCEPTION failed", error));
}

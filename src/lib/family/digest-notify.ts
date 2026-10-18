import { deliverNotification } from "@/lib/notifications/in-app";

// SKO-423: the notice names no evidence or result — only that an update is ready behind sign-in.
// Kept out of digests.ts so the digest service does not load notifications (and Redis).
export async function notifyDigestDeliveries(schoolId: string, campusId: string, created: { guardianUserId: string }[]) {
  const recipients = [...new Set(created.map(c => c.guardianUserId))];
  if (!recipients.length) return;
  await deliverNotification("FAMILY_DIGEST_READY", { schoolId, campusId, recipientIds: recipients }).catch(error => console.error("[digest] notice failed", error));
}

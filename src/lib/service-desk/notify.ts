import { prisma } from "@/lib/db/prisma";
import { deliverNotification } from "@/lib/notifications/in-app";

// SKO-441: service-desk notices, kept apart from the service so it never loads notifications (and Redis).
// A notice names only the reference; the request page holds the detail.

export async function tell(event: string, base: { schoolId: string; campusId: string; actorId?: string | null }, recipients: string[], reference: string) {
  const ids = [...new Set(recipients.filter(Boolean))];
  if (!ids.length) return;
  await deliverNotification(event, { ...base, recipientIds: ids, reference }).catch(error => console.error(`[service-desk] ${event} failed`, error));
}

/** Claim, then tell the escalation contact (or the default owner) once for this due time. */
export async function escalate(request: { id: string; schoolId: string; campusId: string; reference: string; resolveDueAt: Date | null; escalatedForDue: Date | null; version: number; category: { escalationId: string | null; defaultOwnerId: string | null } }) {
  if (!request.resolveDueAt) return false;
  const claimed = await prisma.serviceRequest.updateMany({ where: { id: request.id, version: request.version, escalatedForDue: request.escalatedForDue }, data: { escalatedForDue: request.resolveDueAt, version: { increment: 1 } } });
  if (!claimed.count) return false;
  const to = request.category.escalationId ?? request.category.defaultOwnerId;
  await prisma.serviceRequestEvent.create({ data: { schoolId: request.schoolId, requestId: request.id, version: request.version + 1, kind: "ESCALATED", visibility: "INTERNAL", actorId: null, body: null, detail: { dueAt: request.resolveDueAt.toISOString(), to } } });
  if (to) await tell("SERVICE_REQUEST_ESCALATED", { schoolId: request.schoolId, campusId: request.campusId }, [to], request.reference);
  return true;
}

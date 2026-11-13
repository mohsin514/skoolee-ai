import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertStaffRole } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { renderFamilyMessage } from "./family-message-templates";

// SKAI-1259: bulk family messages per stage (server side). Templates and merge fields live in family-message-templates.
export { STAGE_TEMPLATES, renderFamilyMessage, templatesFor } from "./family-message-templates";

/** Applications that can still receive a message; closed and enrolled ones are skipped. */
export const MESSAGEABLE = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED"];
export const MAX_RECIPIENTS = 200;

/** Records one message per application in this school and campus. Returns how many were sent and skipped. */
export async function messageApplications(db: TxClient, scope: { schoolId: string; campusId: string; actorId: string }, ids: string[], message: string) {
  const applications = await db.admissionApplication.findMany({ where: { id: { in: ids }, schoolId: scope.schoolId, campusId: scope.campusId, status: { in: MESSAGEABLE } }, select: { id: true, reference: true, childName: true } });
  for (const application of applications) {
    await db.admissionApplicationEvent.create({ data: { schoolId: scope.schoolId, applicationId: application.id, actorId: scope.actorId, kind: "MESSAGE", familyMessage: renderFamilyMessage(message, application) } });
  }
  return { sent: applications.length, skipped: ids.length - applications.length };
}

/** Staff with admissions.edit send one message to one or many families (front desk included). */
export async function sendFamilyMessages(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  assertStaffRole(user);
  await assertPermission(user, "admissions", "edit");
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter(Boolean))] : [];
  if (!ids.length) throw new ApiError("Choose at least one application.", 400);
  if (ids.length > MAX_RECIPIENTS) throw new ApiError(`Send to at most ${MAX_RECIPIENTS} applications at once.`, 400);
  const message = String(body.message ?? "").trim();
  if (message.length < 2) throw new ApiError("Write the message to the family.", 400);
  if (message.length > 2000) throw new ApiError("Message to the family is too long (max 2000).", 400);
  return schoolAiTransaction(user, db => messageApplications(db, { schoolId: user.schoolId, campusId, actorId: user.userId }, ids, message));
}

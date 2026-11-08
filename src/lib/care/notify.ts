import { deliverNotification } from "@/lib/notifications/in-app";
import { domainLeads, type Domain } from "./service";

// SKO-439: confidential notices, kept apart from the service so it never loads notifications (and Redis).
// No notice names a student, case reference, observation or conclusion; the workspace shows those to members.

type Base = { schoolId: string; campusId: string; actorId: string };
const send = (event: string, base: Base, recipientIds: string[]) => recipientIds.length
  ? deliverNotification(event, { ...base, recipientIds }).catch(error => console.error(`[care] ${event} failed`, error))
  : Promise.resolve();

export async function notifyConcern(base: Base) { await send("SAFEGUARDING_CONCERN_RECEIVED", base, await domainLeads(base.schoolId, base.campusId, "SAFEGUARDING")); }
export async function notifyOwner(base: Base, ownerId: string) { await send("SAFEGUARDING_CASE_ASSIGNED", base, [ownerId]); }
export async function notifyDisclosureReview(base: Base) { await send("SAFEGUARDING_DISCLOSURE_REVIEW", base, await domainLeads(base.schoolId, base.campusId, "SAFEGUARDING")); }
export async function notifyReleased(base: Base, recipientType: string, recipientUserId: string | null) {
  if (!recipientUserId || recipientType === "EXTERNAL_AGENCY") return;
  await send(recipientType === "GUARDIAN" ? "CARE_MESSAGE_FAMILY" : "CARE_MESSAGE_STAFF", base, [recipientUserId]);
}
export async function notifyEmergency(base: Base, domain: Domain) { await send("CONFIDENTIAL_EMERGENCY_ACCESS", base, await domainLeads(base.schoolId, base.campusId, domain, ["LEAD"])); }

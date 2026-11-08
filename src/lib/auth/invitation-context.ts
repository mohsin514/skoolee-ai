import { createHash } from "node:crypto";
export function invitationContext(invite: { token: string; role: string; campusId: string; schoolId: string; canPurchaseSubscription: boolean; canManageMemberships: boolean }) {
  return createHash("sha256").update(JSON.stringify([invite.token, invite.schoolId, invite.campusId, invite.role, invite.canPurchaseSubscription, invite.canManageMemberships])).digest("hex");
}

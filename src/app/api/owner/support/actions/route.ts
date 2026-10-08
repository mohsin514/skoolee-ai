import { NextRequest } from "next/server";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { cleanSchoolProfileChange, requireSupportGrant, SUPPORT_ACTION, SUPPORT_SCOPE } from "@/lib/owner/support-access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const { domain, action, payload } = await req.json();
    const grant = await requireSupportGrant(actor);
    if (!SUPPORT_SCOPE.includes(domain) || !grant.scope.includes(domain)) throw new ApiError("This domain is outside the approved support scope", 403);
    if (!SUPPORT_ACTION.includes(action) || !grant.actions.includes(action)) throw new ApiError("This action is outside the approved support scope", 403);
    if (action === "read") throw new ApiError("Use the audited workspace for support reads", 400);
    let safePayload: { field: string; value: string } | undefined;
    if (action === "write") {
      if (domain !== "school_profile") throw new ApiError("Support writes are limited to approved school profile fields", 400);
      safePayload = cleanSchoolProfileChange(payload);
    }
    if (action === "export" && domain !== "school_profile") throw new ApiError("Support exports are limited to school profile data", 403);
    const queued = await prisma.$transaction(async (tx) => {
      const row = await tx.supportAction.create({ data: { schoolId: grant.schoolId, grantId: grant.id, actorId: actor.userId, domain, action, payload: safePayload } });
      await tx.superAdminAuditLog.create({ data: {
        userId: actor.userId, action: `support_${action}_queued`, targetType: "support_grant", targetId: grant.id,
        newValues: { schoolId: grant.schoolId, domain, supportActionId: row.id },
      } });
      return row;
    });
    return Response.json({ success: true, data: queued }, { status: 202 });
  } catch (error) { return errorResponse(error, "[owner/support/actions] POST failed"); }
}

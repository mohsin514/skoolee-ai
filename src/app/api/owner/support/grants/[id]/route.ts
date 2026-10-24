import { NextRequest } from "next/server";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { requireSupportGrant, stopSupportGrant, SUPPORT_COOKIE } from "@/lib/owner/support-access";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const { id } = await context.params;
    if ((await cookies()).get(SUPPORT_COOKIE)?.value) await requireSupportGrant(actor, id);
    const grant = await prisma.supportGrant.findUnique({ where: { id } });
    if (!grant || grant.requestedById !== actor.userId) throw new ApiError("Support grant not found", 404);
    await stopSupportGrant(id, actor.userId);
    const response = Response.json({ success: true, data: { grantId: id, status: "revoked" } });
    const current = (await cookies()).get(SUPPORT_COOKIE)?.value;
    if (current) response.headers.set("Set-Cookie", `${SUPPORT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return response;
  } catch (error) { return errorResponse(error, "[owner/support/revoke] DELETE failed"); }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const { id } = await context.params;
    if ((await cookies()).get(SUPPORT_COOKIE)?.value) await requireSupportGrant(actor, id);
    const { status, closureEvidence } = await req.json();
    if (status !== "closed" || typeof closureEvidence !== "string" || closureEvidence.trim().length < 12) throw new ApiError("Closure evidence is required", 400);
    const incident = await prisma.$transaction(async (tx) => {
      const grant = await tx.supportGrant.findUnique({ where: { id } });
      if (!grant || grant.requestedById !== actor.userId) throw new ApiError("Support grant not found", 404);
      if (!["revoked", "expired", "rejected"].includes(grant.status)) {
        const status = grant.expiresAt <= new Date() ? "expired" : "revoked";
        const now = new Date();
        await tx.supportGrant.update({ where: { id }, data: { status, revokedAt: status === "revoked" ? now : grant.revokedAt } });
        await tx.supportAction.updateMany({ where: { grantId: id, status: "queued" }, data: { status: "cancelled", completedAt: now } });
        await tx.workflowJob.updateMany({ where: { supportGrantId: id, state: "queued" }, data: { cancelRequestedAt: now } });
        await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: `support_access_${status}`, targetType: "support_grant", targetId: id, newValues: { schoolId: grant.schoolId } } });
      }
      const incident = await tx.supportIncident.update({ where: { id: grant.incidentId }, data: { status: "closed", closureEvidence: closureEvidence.trim(), closedAt: new Date() } });
      await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: "support_incident_closed", targetType: "support_grant", targetId: id, newValues: { incidentId: incident.id, evidence: closureEvidence.trim() } } });
      return incident;
    });
    return Response.json({ success: true, data: incident });
  } catch (error) { return errorResponse(error, "[owner/support/incident] PATCH failed"); }
}

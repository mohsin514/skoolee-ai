import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { requireSupportGrant } from "@/lib/owner/support-access";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const grant = await requireSupportGrant(actor);
    const actions = await prisma.supportAction.findMany({ where: { grantId: grant.id }, select: { id: true, domain: true, action: true, status: true, createdAt: true, completedAt: true }, orderBy: { createdAt: "desc" }, take: 25 });
    return Response.json({ success: true, data: { id: grant.id, schoolId: grant.schoolId, purpose: grant.purpose, scope: grant.scope, actions: grant.actions, expiresAt: grant.expiresAt.toISOString(), queuedActions: actions } });
  } catch (error) {
    const response = errorResponse(error, "[owner/support/session] GET failed");
    if (error instanceof ApiError && error.status === 403) response.headers.set("Set-Cookie", "skoolee_support_grant=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return response;
  }
}

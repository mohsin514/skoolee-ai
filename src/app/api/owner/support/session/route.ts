import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { requireSupportGrant, SUPPORT_COOKIE } from "@/lib/owner/support-access";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    // SKAI-1801: "no support session" is the normal state of the owner console, polled every 15 s. Answer it as
    // empty data, not a 403 that fills the network tab with errors. A stale, expired or foreign grant still 403s.
    if (!(await cookies()).get(SUPPORT_COOKIE)?.value) return Response.json({ success: true, data: null });
    const grant = await requireSupportGrant(actor);
    const actions = await prisma.supportAction.findMany({ where: { grantId: grant.id }, select: { id: true, domain: true, action: true, status: true, createdAt: true, completedAt: true }, orderBy: { createdAt: "desc" }, take: 25 });
    return Response.json({ success: true, data: { id: grant.id, schoolId: grant.schoolId, purpose: grant.purpose, scope: grant.scope, actions: grant.actions, expiresAt: grant.expiresAt.toISOString(), queuedActions: actions } });
  } catch (error) {
    const response = errorResponse(error, "[owner/support/session] GET failed");
    if (error instanceof ApiError && error.status === 403) response.headers.set("Set-Cookie", "skoolee_support_grant=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return response;
  }
}

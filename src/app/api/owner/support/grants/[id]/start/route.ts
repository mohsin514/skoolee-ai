import { NextRequest } from "next/server";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { issueSupportCookie, SUPPORT_COOKIE, supportCookieExpiresAt } from "@/lib/owner/support-access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformOwner();
    if (!actor.mfaVerified) throw new ApiError("Privileged MFA is required", 403);
    const { id } = await context.params;
    const grant = await prisma.supportGrant.findUnique({ where: { id } });
    if (!grant || grant.requestedById !== actor.userId) throw new ApiError("Support request not found", 404);
    if (!(grant.status === "approved" || grant.status === "active" && grant.emergencyReason) || grant.expiresAt <= new Date()) {
      throw new ApiError("This grant is unapproved or has expired", 403);
    }
    const started = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.supportGrant.updateMany({
        where: { id, schoolId: grant.schoolId, requestedById: actor.userId, status: grant.status, expiresAt: { gt: now }, ...(grant.status === "active" ? { emergencyReason: { not: null } } : {}) },
        data: { ...(grant.status === "approved" ? { status: "active", startedAt: now } : { startedAt: grant.startedAt || now }) },
      });
      if (changed.count !== 1) throw new ApiError("Grant was revoked, expired, or already changed", 403);
      await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: "support_access_started", targetType: "support_grant", targetId: grant.id, newValues: { schoolId: grant.schoolId, scope: grant.scope, actions: grant.actions } } });
      return tx.supportGrant.findUniqueOrThrow({ where: { id } });
    });
    const token = await issueSupportCookie(started);
    const response = Response.json({ success: true, data: { grantId: grant.id, schoolId: grant.schoolId, expiresAt: grant.expiresAt.toISOString() } });
    response.headers.set("Set-Cookie", `${SUPPORT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${supportCookieExpiresAt(grant.expiresAt).toUTCString()}${req.nextUrl.protocol === "https:" ? "; Secure" : ""}`);
    return response;
  } catch (error) { return errorResponse(error, "[owner/support/start] POST failed"); }
}

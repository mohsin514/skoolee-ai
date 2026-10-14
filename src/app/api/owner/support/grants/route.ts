import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { cleanSupportActions, cleanSupportScope, issueSupportCookie, SUPPORT_COOKIE, supportCookieExpiresAt, validateSupportGrantCombination } from "@/lib/owner/support-access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformOwner();
    const grants = await prisma.supportGrant.findMany({
      include: { school: { select: { id: true, name: true } }, incident: { select: { id: true, reference: true, purpose: true, impact: true, status: true, updatedAt: true, ownerActorId: true, closureEvidence: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return Response.json({ success: true, data: grants });
  } catch (error) { return errorResponse(error, "[owner/support/grants] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformOwner();
    if (!actor.mfaVerified) throw new ApiError("Privileged MFA is required", 403);
    const body = await req.json();
    const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    const impact = typeof body.impact === "string" ? body.impact.trim() : "";
    const emergency = body.emergency === true;
    const emergencyReason = typeof body.emergencyReason === "string" ? body.emergencyReason.trim() : "";
    const durationMinutes = Number(body.durationMinutes);
    if (!schoolId || purpose.length < 12 || impact.length < 8) throw new ApiError("School, detailed purpose and impact are required", 400);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > (emergency ? 60 : 480)) throw new ApiError("Grant duration must be between 5 minutes and 8 hours", 400);
    if (emergency && emergencyReason.length < 20) throw new ApiError("Emergency access requires a detailed justification", 400);
    const scope = cleanSupportScope(body.scope);
    const actions = cleanSupportActions(body.actions);
    validateSupportGrantCombination(scope, actions);
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
    if (!school) throw new ApiError("School not found", 404);
    const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
    const { incident, grant } = await prisma.$transaction(async (tx) => {
      const incident = await tx.supportIncident.create({ data: {
        schoolId, reference: `INC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`,
        purpose, impact, ownerActorId: actor.userId,
      } });
      const grant = await tx.supportGrant.create({ data: {
        schoolId, incidentId: incident.id, requestedById: actor.userId, purpose, scope, actions, expiresAt,
        status: emergency ? "active" : "pending", emergencyReason: emergency ? emergencyReason : null,
        reviewDueAt: emergency ? new Date(Math.min(expiresAt.getTime(), Date.now() + 60 * 60_000)) : null,
      } });
      await tx.superAdminAuditLog.create({ data: {
        userId: actor.userId, action: emergency ? "support_emergency_access_started" : "support_access_requested",
        targetType: "support_grant", targetId: grant.id,
        newValues: { schoolId, scope, actions, expiresAt: expiresAt.toISOString(), incidentId: incident.id, emergency },
      } });
      const reviewers = await tx.user.findMany({ where: { schoolId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
      if (reviewers.length) await tx.notification.createMany({ data: reviewers.map(({ id }) => ({
        schoolId, userId: id, type: emergency ? "support_emergency_review" : "support_access_request",
        title: emergency ? "Emergency support access needs review" : "Support access request needs approval",
        message: `${actor.fullName || actor.email} ${emergency ? "opened emergency support access" : "requested support access"} for ${incident.reference}. Purpose: ${purpose}. ${emergency ? `Review by ${grant.reviewDueAt?.toISOString()} UTC.` : `Expires ${expiresAt.toISOString()} UTC.`}`,
        icon: "shield", link: "/super", actorId: actor.userId, actorName: actor.fullName || actor.email,
      })) });
      return { incident, grant };
    });
    const response = Response.json({ success: true, data: { incident, grant } }, { status: 201 });
    if (emergency) {
      const token = await issueSupportCookie(grant);
      response.headers.set("Set-Cookie", `${SUPPORT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${supportCookieExpiresAt(expiresAt).toUTCString()}${req.nextUrl.protocol === "https:" ? "; Secure" : ""}`);
    }
    return response;
  } catch (error) { return errorResponse(error, "[owner/support/grants] POST failed"); }
}

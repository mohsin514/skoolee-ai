import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { stopSupportGrant } from "@/lib/owner/support-access";
import { prisma as basePrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAuthUser();
    if (actor.role !== "SUPER_ADMIN") throw new ApiError("Only a school group administrator can review support access", 403);
    const grants = await prisma.supportGrant.findMany({
      where: { schoolId: actor.schoolId, status: { in: ["pending", "active", "emergency_review"] } },
      include: { incident: { select: { reference: true, purpose: true, impact: true, status: true } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    return Response.json({ success: true, data: grants });
  } catch (error) { return errorResponse(error, "[super/support-grants] GET failed"); }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireAuthUser();
    if (actor.role !== "SUPER_ADMIN" || !actor.mfaVerified) throw new ApiError("A school group administrator with verified MFA must approve support access", 403);
    const { grantId, decision, evidence } = await req.json();
    if (typeof grantId !== "string" || !["approve", "reject", "review", "revoke"].includes(decision)) throw new ApiError("Invalid support review", 400);
    const grant = await prisma.supportGrant.findFirst({ where: { id: grantId, schoolId: actor.schoolId } });
    if (!grant) throw new ApiError("Support request not found for this school", 404);
    if (grant.status === "pending" && (decision === "approve" || decision === "reject")) {
      const nextStatus = decision === "approve" ? "approved" : "rejected";
      const updated = await basePrisma.$transaction(async (tx) => {
        const changed = await tx.supportGrant.updateMany({ where: { id: grant.id, schoolId: actor.schoolId, status: "pending" }, data: { status: nextStatus, approvedById: actor.userId } });
        if (changed.count !== 1) throw new ApiError("Support request already reviewed", 409);
        await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: `support_access_${nextStatus}`, targetType: "support_grant", targetId: grant.id, newValues: { schoolId: actor.schoolId } } });
        return tx.supportGrant.findUniqueOrThrow({ where: { id: grant.id } });
      });
      return Response.json({ success: true, data: updated });
    }
    if (decision === "revoke" && grant.status === "active") {
      const updated = await stopSupportGrant(grant.id, actor.userId);
      return Response.json({ success: true, data: updated });
    }
    if (grant.emergencyReason && decision === "review" && grant.status === "active") {
      const note = typeof evidence === "string" ? evidence.trim() : "";
      if (note.length < 12) throw new ApiError("Review evidence is required", 400);
      const updated = await basePrisma.$transaction(async (tx) => {
        const changed = await tx.supportGrant.updateMany({ where: { id: grant.id, schoolId: actor.schoolId, status: "active", emergencyReason: { not: null }, reviewedAt: null }, data: { reviewedAt: new Date(), reviewEvidence: note } });
        if (changed.count !== 1) throw new ApiError("Emergency access was already reviewed", 409);
        await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: "support_emergency_access_reviewed", targetType: "support_grant", targetId: grant.id, newValues: { schoolId: actor.schoolId, evidence: note } } });
        return tx.supportGrant.findUniqueOrThrow({ where: { id: grant.id } });
      });
      return Response.json({ success: true, data: updated });
    }
    throw new ApiError("This grant cannot be changed in its current state", 409);
  } catch (error) { return errorResponse(error, "[super/support-grants] PATCH failed"); }
}

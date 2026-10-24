import { NextRequest } from "next/server";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { cleanSchoolProfileChange, requireSupportGrant } from "@/lib/owner/support-access";

export const dynamic = "force-dynamic";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const { id } = await context.params;
    const grant = await requireSupportGrant(actor);
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM support_grants WHERE id = ${grant.id} FOR UPDATE`;
      if (!locked.length) throw new ApiError("Support grant not found", 404);
      const currentGrant = await tx.supportGrant.findUnique({ where: { id: grant.id } });
      if (!currentGrant || currentGrant.status !== "active" || currentGrant.expiresAt <= new Date()) throw new ApiError("Support access has expired or been revoked", 403);
      const action = await tx.supportAction.findUnique({ where: { id } });
      if (!action || action.grantId !== currentGrant.id || action.schoolId !== currentGrant.schoolId || action.actorId !== actor.userId) throw new ApiError("Queued support action not found", 404);
      if (action.status !== "queued") throw new ApiError("Support action is no longer queued", 409);
      if (!currentGrant.scope.includes(action.domain) || !currentGrant.actions.includes(action.action)) throw new ApiError("Action is outside the approved support scope", 403);

      let csv: string | undefined;
      if (action.action === "write") {
        if (action.domain !== "school_profile") throw new ApiError("Unsupported support write", 403);
        const change = cleanSchoolProfileChange(action.payload);
        const before = await tx.school.findUnique({ where: { id: currentGrant.schoolId }, select: { id: true, phone: true, contactEmail: true, website: true } });
        if (!before) throw new ApiError("School not found", 404);
        const oldValue = before[change.field];
        await tx.school.update({ where: { id: currentGrant.schoolId }, data: { [change.field]: change.value } });
        await tx.superAdminAuditLog.create({ data: {
          userId: actor.userId, action: "support_write_completed", targetType: "support_grant", targetId: currentGrant.id,
          oldValues: { schoolId: currentGrant.schoolId, domain: action.domain, [change.field]: oldValue },
          newValues: { supportActionId: action.id, [change.field]: change.value },
        } });
      } else if (action.action === "export") {
        if (action.domain !== "school_profile") throw new ApiError("No support export is configured for this domain", 403);
        const school = await tx.school.findUnique({ where: { id: currentGrant.schoolId }, select: { id: true, name: true, city: true, status: true, contactEmail: true, phone: true, website: true } });
        if (!school) throw new ApiError("School not found", 404);
        const keys = Object.keys(school) as (keyof typeof school)[];
        csv = `${keys.map(csvCell).join(",")}\r\n${keys.map((key) => csvCell(school[key])).join(",")}\r\n`;
        await tx.superAdminAuditLog.create({ data: {
          userId: actor.userId, action: "support_export_completed", targetType: "support_grant", targetId: currentGrant.id,
          newValues: { schoolId: currentGrant.schoolId, domain: action.domain, supportActionId: action.id },
        } });
      } else throw new ApiError("Read actions use the audited support workspace", 400);

      const updated = await tx.supportAction.update({ where: { id: action.id }, data: { status: "completed", completedAt: new Date() } });
      return { action: updated, csv };
    });
    if (result.csv !== undefined) {
      return new Response(result.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=school-profile.csv", "Cache-Control": "no-store" } });
    }
    return Response.json({ success: true, data: result.action });
  } catch (error) { return errorResponse(error, "[owner/support/actions/execute] POST failed"); }
}

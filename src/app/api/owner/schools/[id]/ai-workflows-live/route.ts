import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────────
// PUT /api/owner/schools/<id>/ai-workflows-live   { live, acknowledgeRealRecords? }
//
// Switches one school's AI Workflows out of practice mode (src/lib/ai-workflows/practice.ts) before the
// release evaluation is recorded, so AI may save real records there. APP_OWNER only. Turning it on must
// carry the acknowledgement the console's confirm dialog sends; both directions are audited, and the
// switch and its audit row commit in one transaction.
// ─────────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (typeof body?.live !== "boolean") throw new ApiError("live must be true or false", 400);
    const live: boolean = body.live;
    if (live && body.acknowledgeRealRecords !== true) {
      throw new ApiError("Confirm that AI Workflows may change this school's real records", 400);
    }

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true, aiWorkflowsLiveAt: true, aiWorkflowsLiveById: true },
    });
    if (!school) throw new ApiError("School not found", 404);

    // The switch and its audit row commit together: a school is never live without a record of who did it.
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.school.update({
        where: { id },
        data: live
          ? { aiWorkflowsLiveAt: school.aiWorkflowsLiveAt ?? new Date(), aiWorkflowsLiveById: school.aiWorkflowsLiveAt ? school.aiWorkflowsLiveById : user.userId }
          : { aiWorkflowsLiveAt: null, aiWorkflowsLiveById: null },
        select: { aiWorkflowsLiveAt: true, aiWorkflowsLiveById: true },
      });
      await logSuperAdminAction({
        userId: user.userId,
        action: live ? "ai_workflows_live_on" : "ai_workflows_live_off",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        oldValues: { aiWorkflowsLiveAt: school.aiWorkflowsLiveAt, aiWorkflowsLiveById: school.aiWorkflowsLiveById },
        newValues: next,
      }, tx);
      return next;
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id/ai-workflows-live] PUT failed");
  }
}

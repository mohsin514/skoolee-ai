import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { acknowledgeDuty, myCover, recordCoverOutcome, saveHandover, updateRecovery } from "@/lib/cover/recovery";
import { deliverNotification } from "@/lib/notifications/in-app";

export const runtime = "nodejs";

// SKO-442: a teacher's cover — duties they cover (handover, acknowledge, outcome), their own lessons being
// covered (write the handover) and the missed-learning recoveries they own.
// POST {action: handover | acknowledge | outcome | recovery}
export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await myCover(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[cover] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const notice = (event: string, campusId: string, recipientId: string) => deliverNotification(event, { schoolId: user.schoolId, campusId, actorId: user.userId, recipientIds: [recipientId] }).catch(error => console.error(`[cover] ${event} failed`, error));
    switch (body.action) {
      case "handover": {
        const result = await saveHandover(user, body);
        if (result.substituteId !== user.userId) await notice("COVER_HANDOVER_READY", result.campusId, result.substituteId);
        return Response.json({ success: true, data: { dutyId: result.handover.dutyId, updatedAt: result.handover.updatedAt } });
      }
      case "acknowledge": { const h = await acknowledgeDuty(user, String(body.dutyId ?? "")); return Response.json({ success: true, data: { acknowledgedAt: h.acknowledgedAt } }); }
      case "outcome": {
        const result = await recordCoverOutcome(user, body);
        if (result.recoveryId && result.ownerId !== user.userId) await notice("LESSON_RECOVERY_NEEDED", result.campusId, result.ownerId);
        return Response.json({ success: true, data: { outcome: result.outcome, recoveryId: result.recoveryId } });
      }
      case "recovery": { const row = await updateRecovery(user, body); return Response.json({ success: true, data: { id: row.id, status: row.status, version: row.version } }); }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[cover] POST failed"); }
}

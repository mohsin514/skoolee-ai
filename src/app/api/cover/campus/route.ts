import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { campusFollowUp, recordUncovered } from "@/lib/cover/recovery";
import { deliverNotification } from "@/lib/notifications/in-app";

export const runtime = "nodejs";

// SKO-442: the coordinator's follow-up for one date — covered lessons with handover and outcome, and the
// open missed-learning decisions. POST {action: "uncovered", slotId, date} records that a lesson had no
// cover, which opens a recovery decision for its teacher instead of letting it look delivered.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    return Response.json({ success: true, data: await campusFollowUp(user, campusId, request.nextUrl.searchParams.get("date") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[cover/campus] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "uncovered") throw new ApiError("Unknown action", 400);
    const result = await recordUncovered(user, body);
    await deliverNotification("LESSON_RECOVERY_NEEDED", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, recipientIds: [result.ownerId] }).catch(error => console.error("[cover/campus] notice failed", error));
    return Response.json({ success: true, data: { id: result.recovery.id, status: result.recovery.status } }, { status: 201 });
  } catch (error) { return errorResponse(error, "[cover/campus] POST failed"); }
}
